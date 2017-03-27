process.on('uncaughtException', function(err) {
    console.error("child", (err && err.stack) ? err.stack : err);
});

var cp = require("child_process"),
    fs = require("fs"),
    net = require("net");


//var log = fs.createWriteStream('c:\\tmp\\user-app.log');
//process.stdout.write = process.stderr.write = log.write.bind(log);

var ref = require("ref"),
    winapi = require("./winapi.js");


console.log("Hello from the client app", __filename);
console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));
console.log(process.argv);
var ip = process.argv[2];
var port = parseInt(process.argv[3]);

console.log("connecting to ", ip + ":" + port);

var pipe = net.connect(port, ip, function () {
    console.log("client connect");
    pipe.write("hello!\n");
});
pipe.setEncoding("utf8");
pipe.on("data", function (data) {
    console.log("client data:", data);
    pipe.write(data);
});

pipe.on("end", function (data) {
    console.log("client end");
});

setTimeout(console.log, 5000);

