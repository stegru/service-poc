process.on('uncaughtException', function(err) {
    console.error((err && err.stack) ? err.stack : err);
});

var fs = require("fs"),
    service = require("os-service"),
    cp = require("child_process");

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
    ref = require("ref");
    winapi = require("./winapi.js");
    refArray = require("ref-array");

    console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));

    var pipes = createPipes();
    console.log(pipes);

    //startUserProcess(pipes.client.read, pipes.client.write);

var GENERIC_READ = 0x80000000;
var GENERIC_WRITE = 0x40000000;

    pipes.service.read = winapi.kernel32.CreateFileA(new Buffer("c:\\tmp\\a\00"), GENERIC_READ, 3, ref.NULL, 3, 0x40000000, ref.NULL);
    pipes.service.write = winapi.kernel32.CreateFileA(new Buffer("c:\\tmp\\out\00"), GENERIC_WRITE, 3, ref.NULL, 2, 0, ref.NULL);

    // var buf = new Buffer(1000);
    // var ret = winapi.kernel32.ReadFile(pipes.service.read, buf, 100, ref.NULL, ref.NULL);

    // Get the file descriptors (from the win32 HANDLE), so node can use the streams.
    var readFd = winapi.msvcrt._open_osfhandle(pipes.service.read, 0),
        writeFd = winapi.msvcrt._open_osfhandle(pipes.service.write, 0);

    console.log(pipes.service);
    console.log("fds:", readFd, writeFd);



    var inputStream = fs.createReadStream(null, { fd: readFd, autoClose:false });
    var outputStream = fs.createWriteStream(null, { fd: writeFd });

    inputStream.on("data", function (chunk) {
        console.log("GOT:", chunk);
        outputStream.write("hello");
    });
    inputStream.on("close", function () {
        console.log("closed");
    });

}

function checkSuccess(success, msg) {
    if (!success) {
        throw new Error(msg + " success=" + success + " win32=" + winapi.kernel32.GetLastError());
    }
};


/**
 * Creates a pair of pipes. One sends, the other receives. Each pipe has a file descriptor for each end.
 */
function createPipes() {
    var readPipePtr = ref.alloc(winapi.types.HANDLE);
    var writePipePtr = ref.alloc(winapi.types.HANDLE);
    var pipeAttributes = new winapi.SECURITY_ATTRIBUTES();
    pipeAttributes.nLength = winapi.SECURITY_ATTRIBUTES.size;
    pipeAttributes.lpSecurityDescriptor = ref.NULL;
    // This is the magic to allow the pipe to be passed to the child process.
    pipeAttributes.bInheritHandle = true;

    var pipes = {
        service: {},
        client: {}
    };

    // service -> client
    var success = winapi.kernel32.CreatePipe(readPipePtr, writePipePtr, pipeAttributes.ref(), 0);
    checkSuccess(success, "CreatePipe");
    pipes.service.write = writePipePtr.readUInt32LE(0);
    pipes.client.read = readPipePtr.readUInt32LE(0);

    // client -> service
    winapi.kernel32.CreatePipe(readPipePtr, writePipePtr, pipeAttributes.ref(), 0);
    checkSuccess(success, "CreatePipe");
    pipes.client.write = writePipePtr.readUInt32LE(0);
    pipes.service.read = readPipePtr.readUInt32LE(0);

    // TODO: Prevent the service side of the pipes from being inherited

    return pipes;
}

/**
 * Creates the data for STARTUPINFOEX.lpAttributeList which is used to pass inherited handles to CreateProcessAsUser.
 * The handles still need to be marked as inheritable.
 *
 * See https://blogs.msdn.microsoft.com/oldnewthing/20111216-00/?p=8873 for an example, and
 * https://blogs.msdn.microsoft.com/oldnewthing/20130426-00/?p=4543 is the excuse for the complexity...
 * "It's complicated because you are now doing something complicated"
 *
 * Handles are process-specific indexes. The "easy way" to pass handles to another process, is to call DuplicateHandle,
 * but this requires the other process to be already running and then pass the new handles to the process via IPC.
 *
 * @param ... The handles
 * @return A long pointer to the data.
 */
function inheritHandles() {
    var success;
    
    var sizePtr = ref.alloc(winapi.types.SIZE_T);
    success = winapi.kernel32.InitializeProcThreadAttributeList(ref.NULL, arguments.length, 0, sizePtr)  ||
        winapi.kernel32.GetLastError() === winapi.ERROR_INSUFFICIENT_BUFFER;
    checkSuccess(success, "InitializeProcThreadAttributeList");

    var size = sizePtr.deref();
    var attributeList = new Buffer(size);
    success = winapi.kernel32.InitializeProcThreadAttributeList(attributeList, arguments.length, 0, sizePtr);

    var handleBuffer = ref.alloc(winapi.types.HANDLE);
    for (var n = 0; n < arguments.length; n++) {
        handleBuffer.writeUInt32LE(arguments[n], 0);
        winapi.kernel32.UpdateProcThreadAttribute(attributeList, 0, winapi.PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        handleBuffer, 4, ref.NULL, ref.NULL);
    }

    return attributeList;
}

/**
 * Starts something in the context of the logged-in user.
 *
 * https://blogs.msdn.microsoft.com/winsdk/2013/04/30/how-to-launch-a-process-interactively-from-a-windows-service/
 */
function startUserProcess(readHandle, writeHandle) {
console.log("handles:", readHandle, writeHandle);
    var command = new Buffer("node " + __dirname + "/user-app.js " + readHandle + " " + writeHandle);

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
        startupInfo.lpAttributeList = inheritHandles(readHandle, writeHandle);

        var processInfo = new winapi.PROCESS_INFORMATION();
        processInfo.ref().fill(0);

        var ret = winapi.advapi32.CreateProcessAsUserA(token, ref.NULL, command, ref.NULL, ref.NULL,
            0, winapi.EXTENDED_STARTUPINFO_PRESENT, ref.NULL, ref.NULL, startupInfo.ref(), processInfo.ref());
        console.log(ret, processInfo);
    } finally {
        winapi.kernel32.CloseHandle(token);
    }
}
