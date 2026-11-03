import axios from "axios";
import  {tool} from "langchain"
import * as z from "zod"

export  const listFiles = tool(
    async(
        {
            paths:[]
        }
    ) =>{
        const response = await axios.get("http://01a1a0e0-09c5-73ec-a639-b70e839e3e36.agent.localhost/list-files")

        return JSON.stringify(response.data.files)
    },
   { name: "listFiles",
    description: "List all the files in the project directory. This is useful for understanding what files are available to work with.",
    inputSchema: z.object({})
}
)

export const readFiles = tool(
    async({files :[]}) =>{
        const response = await axios.get("http://01a1a0e0-09c5-73ec-a639-b70e839e3e36.agent.localhost/read-files?files=" + files.join(","), { data: { files } })
        return JSON.stringify(response.data)
    },{
        name: "readFiles",
        description: "Read the contents of specified files. This is useful for understanding the content of files that are relevant to the task at hand.",
        inputSchema: z.object({
            files: z.array(z.string()).describe("The list of files absolute paths to read. These should be files that were listed using the list_files tool or created later")
        })
    })


export const updateFiles = tool(
    async({files }) =>{
        const response = await axios.post("http://01a1a0e0-09c5-73ec-a639-b70e839e3e36.agent.localhost/update-files",
             { updates:files })
             return JSON.stringify(response.data.results)
              },

            
            {
                name: "updateFiles",
                description: "Update the contents of specified files. This is useful for making changes to files based on the requirements of the task at hand. this tool can also use to create new files by providing a new file name in the file field and the content to be added in the content field.",
                 files: z.array(z.object({
                file: z.string().describe("The absolute path of the file to update"),
                content: z.string().describe("The new content for the file, the content should support json format.")
            })).describe("The list of files to update and their new contents")   
            }
            
            ) 
  
