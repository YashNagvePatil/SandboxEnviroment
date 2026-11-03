import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';


const  WORKING_DIR = '/workspace';


const app = express();


app.use(morgan('dev'));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  res.status(200).json({ message: "hello from sandbox agent" ,status: "success"});

});

/**
 * @route GET /list-files
 * @description Lists all files in the working directory and its subdirectories. Returns a JSON object with the file paths relative to the working directory. exclude directories like node_modules, .git,dist, etc.
 * - eg. {
 *     "files": [
 *         "file1.txt",
 *         "src/file2.txt",
 *         "src/subdir/file3.txt"
 *     ]
 * }
 */


app.get('/list-files', async (req, res) => {
  const listFiles = async (dir, baseDir) => { 
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (['node_modules', '.git', 'dist'].includes(entry.name)) {
        continue; // Skip excluded directories
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
    res.status(200).json({ message: "Files in working directory", files: files, status: "success" });
  } catch (err) {
    res.status(500).json({ message: "Error listing files", status: "error" });
  } 
});

/**
 * @route GET  /read-files
 * @description Reads the content of all files requested in the query parameter 'files'
 */


app.get("/read-files",async (req,res) =>{
   const files = req.query.files;

   if(!files){
    return res.status(400).json({
      message:'No files specified in query parameter',
      status:'error'
    })
   }

   const fileList = files.split(',')
   
   const result = await Promise.all(fileList.map(async (file)=>{
          const filePath = path.join(WORKING_DIR,file);
          try{
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return{
                     [filePath.replace(WORKING_DIR ,'')] :content,
            }
          }
          catch(err){return {[filePath.replace(WORKING_DIR ,'')]:`Error reading file: ${err.message}`}}
   })) ;
   res.status(200).json({message:"File read completed",
    files:result,status:"success"})

})

/**
 * @route PATCH /update-files
 * @description Updates the content of files specified in the request body. The request body should container a property 'updates' with a JSON Array of object, each object should have a 'file' property specifying the file path (relative to the working directory) and a 'content' property specifying the new content for the file.
 */
app.patch("/update-files", async (req, res) => {
  const  files  = req.body.updates;

  
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({
      message: "invalid request body. expected a json object with an 'updates' property containing an array of file update objects",
      status: "error"
    });
  }

  const updateResults = await Promise.all(
    files.map(async (update) => {
      const { file, content } = update;
      const filePath = path.join(WORKING_DIR, file);
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return { [filePath]: "File updated successfully" };
      } catch (err) {
        return { [filePath]: `Error updating file: ${err.message}` };
      }
    })
  );

  res.status(200).json({ message: "File updates completed", results: updateResults, status: "success" });
});


/**
 * @route POST /create-files
 * @description Creates new files with the content specified in the request body. 
 * The request body should contain a property 'files' with a JSON Array of objects, 
 * each object should have a 'file' property specifying the file path (relative to the working directory) and a 'content' property specifying the content for the new file.
 */


app.post('/create-files', async (req, res) => {
  const  files  = req.body.files 

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      message: "invalid request body. expected a property 'files' with a non-empty array of file objects",
      status: "error"
    });
  }

  const createResults = await Promise.all(
    files.map(async (filesobj) => {
      const {file,content} = filesobj;
      const filePath = path.join(WORKING_DIR,file);
      try {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
        return { [filePath]: "File created successfully" };
      } catch (err) {
        return { [filePath]: `Error creating file: ${err.message}` };
      }
    })
  );

  res.status(201).json({ message: "Files created successfully", results: createResults, status: "success" });
});




export default app
