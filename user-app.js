process.on('uncaughtException', function(err) {
    console.error((err && err.stack) ? err.stack : err);
});

var cp = require("child_process"),
    fs = require("fs"),
    ref = require("ref"),
    winapi = require("./winapi.js");


var log = fs.createWriteStream('c:\\tmp\\user-app.log');
process.stdout.write = process.stderr.write = log.write.bind(log);

console.log("Hello from", __filename);
console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));
console.log(process.argv);
var readHandle = parseInt(process.argv[2]),
    writeHandle = parseInt(process.argv[3]);

console.log("handles:", readHandle, writeHandle);

var readFD = winapi.msvcrt._open_osfhandle(readHandle, 0),
    writeFD = winapi.msvcrt._open_osfhandle(writeHandle, 0);
console.log("fds:", readFD, writeFD);

var inputStream = fs.createReadStream(null, { fd: readFD });
var outputStream = fs.createWriteStream(null, { fd: writeFD });

inputStream.on("data", function (chunk) {
    console.log("GOT:", chunk);
    outputStream.write("hello");
});
inputStream.on("close", function () {
    console("closed");
});

outputStream.write("hi");

