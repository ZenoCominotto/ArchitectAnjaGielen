const fs = require("fs");
const path = require("path");

exports.handler = async function() {
  const dirPath = path.join(__dirname, "../Pictures");
  const files = fs.readdirSync(dirPath).filter(f => /\.(jpg|png|jpeg|gif)$/i.test(f));

  const images = files.map(f => `/Pictures/${f}`);

  return {
    statusCode: 200,
    body: JSON.stringify(images)
  };
};
