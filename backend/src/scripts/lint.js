const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");

const collectJsFiles = (dirPath) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
};

const jsFiles = collectJsFiles(rootDir);

for (const file of jsFiles) {
  try {
    const code = fs.readFileSync(file, "utf8");
    new vm.Script(code, { filename: file });
  } catch (error) {
    process.stderr.write(`Syntax error in ${file}\n${error.message}\n`);
    process.exit(1);
  }
}

console.log(`Backend syntax lint passed (${jsFiles.length} files checked)`);
