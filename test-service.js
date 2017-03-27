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
    var net = require("net");
    ref = require("ref");
    winapi = require("./winapi.js");
    refArray = require("ref-array");

    console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));

    var pid = -1;

    var server = net.createServer(function (socket) {
        console.log("connected");
        if (!checkSocketProcess(socket, pid)) {
            socket.end("I don't like you.\n");
            return;
        }
        socket.write("hello");
        socket.on("data", function (data) {
            console.log("data", data.toString());
            socket.write(data.toString("utf8", 1));
        });
    });

    // Listening on 127.0.0.1 will allow only local connections.
    // An ephemeral port is used instead of a fixed one to avoid listening on one that's already in use - whatever is
    // provided is guaranteed to be unused. The port number is passed onto client. Randomisation is not required,
    // because the port is known as soon as it's opened anyway.
    server.listen(0, "127.0.0.1", function () {
        var addr = server.address();
        pid = startUserProcess(addr.address + " " + addr.port);
        console.log("listening on ", addr);
    });

}

/**
 * Checks if the given socket has the child process on the other end, by inspecting the TCP table.
 *
 * @param socket {Socket} The socket.
 * @param pid {Number} The expected pid.
 * @return {boolean} true if the child process is at the remote end of the socket.
 */
function checkSocketProcess(socket, pid) {

    // host to network byte order
    var htons = function (n) {
        return ((n & 0xff) << 8) | ((n >> 8) & 0xff);
    };

    // GetTcpTable2 returns addresses in host order (LE), but the ports are in network order.
    var localPort = htons(socket.localPort);
    var remotePort = htons(socket.remotePort);
    var localhost = 0x0100007F;

    var connections = getTcpConnections();
    if (!connections) {
        return false;
    }

    var remoteConnection = connections.filter(function (con) {
        // When looking at the remote connection, the local port is this connection's remote port.
        return con.pid === pid
            && con.localAddress === localhost && con.remoteAddress === localhost
            && con.localPort === remotePort && con.remotePort === localPort;
    });

    return remoteConnection.length === 1;
}

function checkSuccess(returnCode, msg) {
    if (returnCode) {
        throw new Error(msg + " success=" + returnCode + " win32=" + winapi.kernel32.GetLastError());
    }
}

/**
 * Returns an array of all established TCP connections on the system.
 *
 * @return {Array} localAddress/Port, remoteAddress/Port, and pid of each connection.
 */
function getTcpConnections() {

    var sizeBuffer = ref.alloc(winapi.types.ULONG);

    // GetTcpTable2 is called first to get the required buffer size.
    var ret = winapi.iphlpapi.GetTcpTable2(ref.NULL, sizeBuffer, false);

    if (ret !== winapi.ERROR_INSUFFICIENT_BUFFER) {
        checkSuccess(ret, "GetTcpTable2");
        return null;
    }

    // Add extra space in case the table grew (the chance of this is slim, unless node stops to read this comment).
    var size = sizeBuffer.deref() + 100;
    sizeBuffer.writeUInt32LE(size);
    var tableBuffer = new Buffer(size);

    ret = winapi.iphlpapi.GetTcpTable2(tableBuffer, sizeBuffer, false);
    checkSuccess(ret, "GetTcpTable2 #2");

    var table = winapi.createMIBTcpTable2(tableBuffer);

    var rowCount = table.dwNumEntries;
    var tableTogo = [];
    for (var r = 0; r < rowCount; r++) {
        var row = table.table[r];
        if (row.dwState === winapi.MIB_TCP_STATE_ESTAB) {
            tableTogo.push({
                localAddress: row.dwLocalAddr,
                localPort: row.dwLocalPort & 0xFFFF, // "The upper 16 bits may contain uninitialized data." - MSDN
                remoteAddress: row.dwRemoteAddr,
                remotePort: row.dwRemotePort & 0xFFFF,
                pid: row.dwOwningPid
            });
        }
    }

    return tableTogo;
}

/**
 * Starts something in the context of the logged-in user.
 *
 * https://blogs.msdn.microsoft.com/winsdk/2013/04/30/how-to-launch-a-process-interactively-from-a-windows-service/
 */
function startUserProcess(pipeName) {

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
        return processInfo.dwProcessId;
    } finally {
        winapi.kernel32.CloseHandle(token);
    }


}
