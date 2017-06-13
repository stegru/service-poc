process.on('uncaughtException', function(err) {
    console.error((err && err.stack) ? err.stack : err);
});
var service = require("os-service");
var fs = require("fs");

// ref and winapi.js need to be loaded after the call to service.remove, otherwise the service takes too long to let
// Windows know it's started.
var ref, winapi, arrayType;
;

var serviceName = "test-service";

var entryPoints = {
    "install": function () {
        // Install the service. For this to work, it needs to be ran as Administrator.
        console.log("Installing");
        service.add(serviceName, {
            programArgs: ["service"]
        }, function (error) {
            console.log(error || "Success");
        });
    },
    "uninstall": function () {
        // Uninstall the service. For this to work, it needs to be ran as Administrator.
        console.log("Uninstalling");
        service.remove(serviceName, function (error) {
            console.log(error || "Success");
        });
    },
    "service": function () {
        // Running the service
        var logStream = fs.createWriteStream("c:\\tmp\\" + serviceName + "-log.txt");
        service.run(logStream, function () {
            console.log("Stopped");
            service.stop();
            setTimeout(process.exit, 1000);
        });

        runService();
    },
    "test-service": function () {
        runService();
    }
};

var entry = entryPoints[process.argv[2]];
if (entry) {
    entry();
} else {
    console.log("huh?");
}

function runService() {
    var cp = require("child_process");
    var net = require("net");
    ref = require("ref");
    winapi = require("./winapi.js");
    arrayType = require("ref-array")

    console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));

    var connected = {
        server: false,
        client: false
    };

    var challenge = "CHALLENGE";

    var pipeHandle;

    var spawn = function () {
        if (connected.server && connected.client) {
            startUserProcess(pipeHandle);
        }
    };

    var server = net.createServer(function (socket) {
        console.log("got connection");
        connected.server = true;
        spawn();
        socket.write("hello");
        socket.on("data", function (data) {
            console.log("data", data.toString());
            if (data.length <=  1) {
                socket.close();
            }
            socket.write(data.toString("utf8").substr(1));
        });
    });
    server.maxConnections = 1;
    var pipeName = "\\\\?\\pipe\\mypipe" + Math.random();
    connect();
    //connect();
    server.listen(pipeName, function () {
        console.log("listening");
    });
    function connect() {
        // connect to it
        connectToPipe(pipeName, challenge, function (err, ret) {
            if (err) {
                throw err;
            }
            console.log("connected");

            pipeHandle = ret;
            connected.client = true;
            // Send the challenge

            spawn();
            setTimeout(function () {
                if (!connected.server) {
                    server.close();
                    winapi.kernel32.CloseHandle(pipeHandle);
                    pipeHandle = connected.client = undefined;
                    runService();
                }
            }, 200);
        });
    }
}


function checkSuccess(returnCode, msg) {
    if (returnCode) {
        throw new Error(msg + " success=" + returnCode + " win32=" + winapi.kernel32.GetLastError());
    }
}

function connectToPipe(pipeName, challenge, callback) {
    console.log("Connecting to ", pipeName);
    var GENERIC_READ = 0x80000000;
    var GENERIC_WRITE = 0x40000000;
    var OPEN_EXISTING = 3;

    var pipeAttributes = new winapi.SECURITY_ATTRIBUTES();
    pipeAttributes.nLength = winapi.SECURITY_ATTRIBUTES.size;
    pipeAttributes.lpSecurityDescriptor = ref.NULL;
    // This is the magic to allow the pipe to be passed to the child process.
    pipeAttributes.bInheritHandle = true;

    console.log("waiting...");
    winapi.kernel32.WaitNamedPipeA.async(pipeName, 0xffffffff, function () {
        console.log("waited");
        winapi.kernel32.CreateFileA.async(
            new Buffer(pipeName + "\0"), 0xC0000000, 0, pipeAttributes.ref(), OPEN_EXISTING, 0, 0,
            function (err, ret) {
                checkSuccess(!ret, "CreateFileA");
                if (err) {
                    callback(err, null);
                    return;
                }
                //
                var r = winapi.kernel32.WriteFile(ret, new Buffer(challenge), challenge.length, ref.NULL, ref.NULL);
                checkSuccess(!r, "WriteFile");
                callback(err, ret);
            });
    });

}

/**
 * @param ... The handles
 * @return A long pointer to the data.
 */
function inheritHandles() {
    var success;
    var HANDLE_FLAG_INHERIT = 1;

    for (var n = 0; n < arguments.length; n++) {
        success = winapi.kernel32.SetHandleInformation(arguments[n], HANDLE_FLAG_INHERIT, 1);
    }
}

/**
 * Starts something in the context of the logged-in user.
 *
 * https://blogs.msdn.microsoft.com/winsdk/2013/04/30/how-to-launch-a-process-interactively-from-a-windows-service/
 */
function startUserProcess(pipeHandle) {
    console.log("handle:", pipeHandle);
    var command = new Buffer("node " + __dirname + "/user-app.js " + pipeHandle);
//    var command = new Buffer("c:\\gpii\\gpii-app\\node_modules\\electron\\dist\\electron  --require c:\\gpii\\helpers\\limit-links.js c:\\gpii\\gpii-app\\main.js");

    // Get the session ID of the console session.
    var sessionId = winapi.kernel32.WTSGetActiveConsoleSessionId();

    // Get the access token of whoever is logged into the session. Roughly, only a service can call this.
    var tokenPtr = ref.alloc(winapi.types.HANDLE);
    winapi.wtsapi32.WTSQueryUserToken(sessionId, tokenPtr);
    var token = tokenPtr.deref();
token = 0;
    try {
        var STARTF_USESTDHANDLES = 0x00000100;

        var startupInfo = new winapi.STARTUPINFOEX();
        startupInfo.ref().fill(0);
        startupInfo.cb = winapi.STARTUPINFOEX.size;
        startupInfo.lpDesktop = new Buffer("winsta0\\default\x00");

        startupInfo.dwFlags = STARTF_USESTDHANDLES;

        var i = -10 >>> 0,
            o = -11 >>> 0,
            e = -12 >>> 0;
        startupInfo.hStdInput = winapi.kernel32.GetStdHandle (i);
        startupInfo.hStdOutput = winapi.kernel32.GetStdHandle(o);
        startupInfo.hStdError = winapi.kernel32.GetStdHandle (e);

        //startupInfo.lpAttributeList = 0;
        inheritHandles(
            pipeHandle,
            startupInfo.hStdInput,
            startupInfo.hStdOutput,
            startupInfo.hStdError
        );


        // Undocumented way of how the crt passes handles
        var buf = new winapi.CHILD_STDIO();
        buf.ref().fill(0);
        buf.number_of_fds = 4;
        buf.crt_flags[0] = 0x1;
        buf.os_handle[0] = startupInfo.hStdInput;
        buf.crt_flags[1] = 0x1;
        buf.os_handle[1] = startupInfo.hStdOutput;
        buf.crt_flags[2] = 0x1;
        buf.os_handle[2] = startupInfo.hStdError;
        buf.crt_flags[3] = 0x1;
        buf.os_handle[3] = pipeHandle;
        startupInfo.cbReserved2 = winapi.CHILD_STDIO.size;
        startupInfo.lpReserved2 = buf.ref();

        var processInfo = new winapi.PROCESS_INFORMATION();
        processInfo.ref().fill(0);

        var ret = winapi.advapi32.CreateProcessAsUserA(token, ref.NULL, command, ref.NULL, ref.NULL,
            1, 0, ref.NULL, ref.NULL, startupInfo.ref(), processInfo.ref());
        checkSuccess(!ret, "CreateProcessAsUserA");
        console.log(ret, processInfo);
    } finally {
        winapi.kernel32.CloseHandle(token);
    }
}