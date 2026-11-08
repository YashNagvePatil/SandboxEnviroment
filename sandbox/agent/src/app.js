import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import http from 'http'
import pty from 'node-pty';
import os from 'os';


const WORKING_DIR = '/workspace';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer,{
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  }
});

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get("/", (req, res) => {
  res.status(200).json({ message: "hello from sandbox agent", status: "success" });
});

const shell = process.env.SHELL || 'bash'

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: "/workspace",
  env: process.env
});

 ptyProcess.onData((data) => {
  io.emit('terminal-output', data);
});

ptyProcess.onExit(({ exitCode, signal }) => {
  console.log(`PTY process exited with code:"${exitCode},signal: ${signal}`)
});


io.on('connection', (socket) => {
  console.log('A client connected:',+ socket.id);

  socket.on('terminal-input', (data) => {
    ptyProcess.write(data);
  });

  socket.on('disconnect', () => {
    console.log('A client disconnected:', + socket.id);
  });
});



/**
 * @route GET /list-files
 * @description Lists all files recursively, excluding node_modules, .git, dist
 */
app.get('/list-files', async (req, res) => {
  const listFiles = async (dir, baseDir) => { 
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        files.push(...await listFiles(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  };

  try {
    const files = await listFiles(WORKING_DIR, WORKING_DIR);
    res.status(200).json({ message: "Files in working directory", files, status: "success" });
  } catch (err) {
    res.status(500).json({ message: "Error listing files", error: err.message, status: "error" });
  } 
});

/**
 * @route GET /read-files?files=src/App.jsx,src/App.css
 * @description Reads content of specified files (comma separated)
 */
app.get("/read-files", async (req, res) => {
  const filesParam = req.query.files;

  if (!filesParam) {
    return res.status(400).json({
      message: 'No files specified in query parameter',
      status: 'error'
    });
  }

  const fileList = filesParam.split(',');

  const results = await Promise.all(fileList.map(async (file) => {
    const filePath = path.join(WORKING_DIR, file.trim());
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { [file.trim()]: content };
    } catch (err) {
      return { [file.trim()]: `Error reading file: ${err.message}` };
    }
  }));

  res.status(200).json({ message: "Files read", results, status: "success" });
});

/**
 * @route PATCH /update-files
 * @description Updates or creates files. Body: { files: [{ path, content }] }
 */
app.patch("/update-files", async (req, res) => {
  const fileList = req.body.files || req.body.updates;

  if (!fileList || !Array.isArray(fileList)) {
    return res.status(400).json({
      message: "No files specified in request body",
      status: "error"
    });
  }

  const updateResults = await Promise.all(
    fileList.map(async (item) => {
      const relativePath = item.path || item.file;
      const content = item.content;
      if (!relativePath) return { error: "Path not specified" };
      const filePath = path.join(WORKING_DIR, relativePath);
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content ?? "", 'utf-8');
        return { [relativePath]: "File updated successfully" };
      } catch (err) {
        return { [relativePath]: `Error updating file: ${err.message}` };
      }
    })
  );

  res.status(200).json({ message: "File updates completed", results: updateResults, status: "success" });
});

/**
 * @route POST /create-files
 * @description Creates new files. Body: { files: [{ path, content }] }
 */
app.post('/create-files', async (req, res) => {
  const files = req.body.files;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      message: "Invalid request body",
      status: "error"
    });
  }

  const createResults = await Promise.all(
    files.map(async ({ path: relativePath, content }) => {
      const filePath = path.join(WORKING_DIR, relativePath);
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return { [relativePath]: "File created successfully" };
      } catch (err) {
        return { [relativePath]: `Error creating file: ${err.message}` };
      }
    })
  );

  res.status(201).json({ message: "Files created successfully", results: createResults, status: "success" });
});

export default httpServer;
