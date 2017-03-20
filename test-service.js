
process.on('uncaughtException', function(err) {
    console.error((err && err.stack) ? err.stack : err);
});
var service = require("os-service");
var fs = require("fs");

// ref and winapi.js need to be loaded after the call to service.remove, otherwise the service takes too long to let
// Windows know it's started.
var ref, winapi, refArray;

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
    ref = require("ref");
    winapi = require("./winapi.js");
    refArray = require("ref-array");

    console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));

    var pipeName = "\\\\.\\pipe\\service-test";

    // // TODO: set security of the pipe
    // var pipeAttributes = new winapi.SECURITY_ATTRIBUTES();
    // pipeAttributes.ref().fill(0);
    // pipeAttributes.nLength = winapi.SECURITY_ATTRIBUTES.size;
    // pipeAttributes.lpSecurityDescriptor = ref.NULL;


    var PIPE_REJECT_REMOTE_CLIENTS = 0x00000008;
    var PIPE_ACCESS_DUPLEX = 0x00000003;
    var FILE_FLAG_OVERLAPPED = 0x40000000;
    var PIPE_TYPE_MESSAGE = 0x00000004;
    var PIPE_READMODE_MESSAGE = 0x00000002;

    var pipeHandle = winapi.kernel32.CreateNamedPipeA(new Buffer(pipeName + "\0"),
        PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
        PIPE_READMODE_MESSAGE | PIPE_TYPE_MESSAGE | PIPE_REJECT_REMOTE_CLIENTS,
        1, 1000, 1000, 0, ref.NULL);

    checkSuccess(pipeHandle, "CreateNamedPipeA");

    // start the process after the pipe is created, but before waiting for the connection.
    startUserProcess(pipeHandle, pipeName);

    var overlapped = new winapi.OVERLAPPED();
    overlapped.ref().fill(0);
    overlapped.hEvent = winapi.kernel32.CreateEventA(ref.NULL, true, false, ref.NULL);
    checkSuccess(overlapped.hEvent, "CreateEventA");

    // this blocks, but passing overlapped breaks the read.
    var connectRet = winapi.kernel32.ConnectNamedPipe(pipeHandle, ref.NULL);
    checkSuccess(connectRet, "ConnectNamedPipe");

    var buf = new Buffer(2000);
    buf.ref().fill(0);

    // overlapped = new winapi.OVERLAPPED();
    // overlapped.ref().fill(0);

    function readComplete(dwErrorCode, dwNumberOfBytesTransfered, lpOverlapped) {
        //console.log("read complete", dwErrorCode, dwNumberOfBytesTransfered);
        if (dwErrorCode) {
            console.log("error code:", dwErrorCode)
        } else {
            console.log(buf.toString("utf8", 0, dwNumberOfBytesTransfered));
            var sendBytes = dwNumberOfBytesTransfered - 1;
            if (sendBytes > 0) {
                winapi.kernel32.WriteFileEx(pipeHandle, buf, sendBytes, lpOverlapped.ref(), winapi.FileIOCompletionRoutine(writeComplete));
            } else {
                winapi.kernel32.CloseHandle(pipeHandle);
            }
        }
    }

    function writeComplete(dwErrorCode, dwNumberOfBytesTransfered, lpOverlapped) {
        console.log("write complete", dwErrorCode, dwNumberOfBytesTransfered);
        if (dwErrorCode) {
            console.log("error code:", dwErrorCode);
        }
    }

    var WAIT_FAILED = -1;
    var worker = function () {
        var waitReturn = winapi.kernel32.WaitForSingleObjectEx(pipeHandle, 0, true);
        switch (waitReturn) {
        case 0:
            winapi.kernel32.ReadFileEx(pipeHandle, buf, 20, overlapped.ref(), winapi.FileIOCompletionRoutine(readComplete));
            break;
        case WAIT_FAILED:
            return;
        }

        setTimeout(worker, 500);
    };
    worker();
}

function checkSuccess(success, msg) {
    if (!success) {
        throw new Error(msg + " success=" + success + " win32=" + winapi.kernel32.GetLastError());
    }
}

/**
 * Starts something in the context of the logged-in user.
 *
 * https://blogs.msdn.microsoft.com/winsdk/2013/04/30/how-to-launch-a-process-interactively-from-a-windows-service/
 */
function startUserProcess(pipeHandle, pipeName) {

    var command = new Buffer("node " + __dirname + "/user-app.js " + pipeName + "\0");

    try {
        // Get the session ID of the console session.
        var sessionId = winapi.kernel32.WTSGetActiveConsoleSessionId();

        // Get the access token of whoever is logged into the session. Roughly, only a service can call this.
        var tokenPtr = ref.alloc(winapi.types.HANDLE);
        winapi.wtsapi32.WTSQueryUserToken(sessionId, tokenPtr);
        var token = tokenPtr.deref();

        var startupInfo = new winapi.STARTUPINFOEX();
        startupInfo.ref().fill(0);
        startupInfo.cb = winapi.STARTUPINFOEX.size;
        startupInfo.lpDesktop = new Buffer("winsta0\\default\x00");

        var processInfo = new winapi.PROCESS_INFORMATION();
        processInfo.ref().fill(0);

        var ret = winapi.advapi32.CreateProcessAsUserA(token, ref.NULL, command, ref.NULL, ref.NULL,
            0, winapi.EXTENDED_STARTUPINFO_PRESENT, ref.NULL, ref.NULL, startupInfo.ref(), processInfo.ref());
        console.log(ret, processInfo);
    } finally {
        winapi.kernel32.CloseHandle(token);
    }
}
