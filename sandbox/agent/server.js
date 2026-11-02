import app from "./src/app.js";

const server = app.listen(3000, () => {
  console.log('sandbox server is running on port 3000');
});