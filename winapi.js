var ffi = require("ffi"),
    ref = require("ref"),
    Struct = require("ref-struct");

var winapi = {};

winapi.types = {
    BOOL: "int",
    HANDLE: "uint",
    PHANDLE: "void*",
    LP: "void*",
    SIZE_T: "ulong",
    WORD: "uint",
    DWORD: "ulong",
    ULONG: "ulong",
    LPTSTR: "char*"
};

winapi.ERROR_INSUFFICIENT_BUFFER = 0x7a;
winapi.PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x20002; // (ProcThreadAttributeHandleList | PROC_THREAD_ATTRIBUTE_INPUT)
winapi.EXTENDED_STARTUPINFO_PRESENT = 0x80000;

var t = winapi.types;

// https://msdn.microsoft.com/library/ms686329
winapi.STARTUPINFOEX = new Struct([
    [t.DWORD, "cb"],
    [t.LPTSTR, "lpReserved"],
    [t.LPTSTR, "lpDesktop"],
    [t.LPTSTR, "lpTitle"],
    [t.DWORD, "dwX"],
    [t.DWORD, "dwY"],
    [t.DWORD, "dwXSize"],
    [t.DWORD, "dwYSize"],
    [t.DWORD, "dwXCountChars"],
    [t.DWORD, "dwYCountChars"],
    [t.DWORD, "dwFillAttribute"],
    [t.DWORD, "dwFlags"],
    [t.WORD, "wShowWindow"],
    [t.WORD, "cbReserved2"],
    [t.LP, "lpReserved2"],
    [t.HANDLE, "hStdInput"],
    [t.HANDLE, "hStdOutput"],
    [t.HANDLE, "hStdError"],
    [t.LP, "lpAttributeList"]
]);

// https://msdn.microsoft.com/library/ms684873
winapi.PROCESS_INFORMATION = new Struct([
    [t.HANDLE, "hProcess"],
    [t.HANDLE, "hThread"],
    [t.DWORD, "dwProcessId"],
    [t.DWORD, "dwThreadId"]
]);

// https://msdn.microsoft.com/library/aa379560
winapi.SECURITY_ATTRIBUTES = new Struct([
    [t.DWORD, "nLength"],
    [t.LP, "lpSecurityDescriptor"],
    [t.BOOL, "bInheritHandle"]
]);

winapi.kernel32 = ffi.Library("kernel32", {
    // https://msdn.microsoft.com/library/aa383835
    "WTSGetActiveConsoleSessionId": [
        t.DWORD, []
    ],
    "CloseHandle": [
        t.BOOL,  [ t.HANDLE ]
    ],
    "GetLastError": [
        "int32", []
    ],
    // https://msdn.microsoft.com/library/aa365152
    "CreatePipe": [
        t.BOOL, [ t.PHANDLE, t.PHANDLE, t.LP, t.DWORD ]
    ],
    // https://msdn.microsoft.com/library/ms683481
    "InitializeProcThreadAttributeList": [
        t.BOOL, [ t.LP, t.DWORD, t.DWORD, t.LP ]
    ],
    // https://msdn.microsoft.com/library/ms686880
    "UpdateProcThreadAttribute": [
        t.BOOL, [ t.LP, t.DWORD, t.HANDLE, t.LP, t.SIZE_T, t.LP, t.LP ]
    ],
    "ReadFile": [
        t.BOOL, [ t.HANDLE, t.LP, t.DWORD, t.LP, t.LP ]
    ],
    "CreateFileA": [
        t.HANDLE, [ "char*", t.DWORD, t.DWORD, t.LP, t.DWORD, t.DWORD, t.HANDLE ]
    ]
});

winapi.wtsapi32 = ffi.Library("wtsapi32", {
    // https://msdn.microsoft.com/library/aa383840
    "WTSQueryUserToken": [
        t.BOOL, [ t.ULONG, t.LP ]
    ]
});

winapi.msvcrt = ffi.Library("msvcrt", {
    // https://msdn.microsoft.com/library/bdts1c9x
    "_open_osfhandle": [
        "int", [ "int", "int" ]
    ],
    // https://msdn.microsoft.com/library/ks2530z6
    "_get_osfhandle": [
        "int", [ "int" ]
    ]
});

winapi.advapi32 = ffi.Library("advapi32", {
    // https://msdn.microsoft.com/library/ms682429
    // ANSI version used due to laziness
    "CreateProcessAsUserA": [
        t.BOOL, [
            t.HANDLE,  // HANDLE                hToken,
            t.LPTSTR,  // LPCTSTR               lpApplicationName,
            t.LPTSTR,  // LPTSTR                lpCommandLine,
            t.LP,      // LPSECURITY_ATTRIBUTES lpProcessAttributes,
            t.LP,      // LPSECURITY_ATTRIBUTES lpThreadAttributes,
            t.BOOL,    // BOOL                  bInheritHandles,
            t.DWORD,   // DWORD                 dwCreationFlags,
            t.LP,      // LPVOID                lpEnvironment,
            t.LP,      // LPCTSTR               lpCurrentDirectory,
            t.LP,      // LPSTARTUPINFO         lpStartupInfo,
            t.LP       // LPPROCESS_INFORMATION lpProcessInformation
        ]
    ]
});

module.exports = winapi;