# service-poc
Proof of concept for running a service, and starting a child process in the context of the current user.

## Sockets
This branch experiments with using sockets.

* Only binding to 127.0.0.1, blocking outsiders.
* An ephemeral port is used to guard against squatting and deployment problems. The port is passed to the child process.
* When the client has connected, stop listening for new connections.
* Secured by inspecting the TCP table and verifying the PID at the other end is the child process.
* Can be used in a way that's natural to node (it's asynchronous).

```javascript
// Passing '0' makes the OS pick an unused port. The port is known when it's bound.
server.listen(0, "127.0.0.1", function () {
    port = server.address().port;
});
```

Using TCP connections has the unfortunate (and unscientific) "feeling" of not being right.

Windows firewall (or AV) may complain about the process opening a connection. Windows firewall can be controlled with the `netsh` command during installation. Might not be an issue for Windows Services.

Windows does have [Winsock Secure Socket Extensions](https://msdn.microsoft.com/library/bb394815), but this might require a lower level access to the socket than what node.js provides. (not certain if this API provides what we need).


## Other IPC methods

### Named pipes (node.js built-in) 
Name pipe support is built into node, but accepts any process without the ability to identify/restrict/validate the client.
```javascript
server.listen("\\\\?\\pipe\\mypipe");
```

### Named pipes (Windows API)
Able to secure the pipe, but not able to use it in an async manner. Requires polling/waiting even when using the asynchronous API functions [ReadFileEx](https://msdn.microsoft.com/library/aa365468).

To make the pipe "flow", the thread needs to be in "an alertable wait state". Using [WaitForSingleObjectEx](https://msdn.microsoft.com/library/ms687036) (and others), this is effectively a "Sleep" command which blocks the thread until when the pipe has something to say. (a rough implementation here: [named-pipe:test-service.js:126](https://github.com/stegru/service-poc/blob/named-pipe/test-service.js#L126)

It might be possible to make it work well with node by using a native module (proven to support extra threads) or edge.js.

**Good news**: The client does not require this, and can enjoy this named pipe using the built-in library.

### Anonymous Pipe
This was probably the most secure approach, because an anonymous pipe can only be used by another process if it's been explicitly shared.

However, anonymous pipes can't be used when communicating between a service and user process because the handles can't be shared over different login/desktop sessions (Windows services are in another session than the user).
 [CreateProcessAsUser](https://msdn.microsoft.com/library/ms682429): You cannot inherit handles across sessions. Additionally, if this parameter is TRUE, you must create the process in the same session as the caller.

It might be possible for the service to start another high-privilege process in the same session as the user. 

#### More notes:

A "pipe" is two streams; one write and one read. To make communication full-duplex, two pipes are used:
```
         Service      Child
Pipe1    write    =>  read 
Pipe2    read     <=  write 
```

* There was no problem creating the pipe ([createPipes](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L107))
* Making the inheritable, and passing it to a new process was harder than it should be ([inheritHandles](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L152))

I couldn't find a way to get node to use the pipe:
* Node uses file descriptors, not file handles.
* [_open_osfhandle](https://msdn.microsoft.com/library/bdts1c9x) gets the FD from the handle. It "works", but because the JS code invokes this function via FFI, it's a different instance to the C run-time than what Node is internally using. So it fails when passing this FD to create(Read/Write)Stream stream.
* The file handles can still be used, but only via windows API calls.
* In theory, these file descriptors will be ok for the child process.
* Need to find another way to create an anonymous pipe in node. Might require making a native module.



## Service creation
It's been easy to create a service with node, thanks to the [os-service](https://github.com/stephenwvickers/node-os-service) npm module.
* Installing it is just a case of executing a few lines of code as Administrator (the installer can invoke this). [test-service.js:19](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L19)
* When starting the service, I think there's about 3 second limit for a new service respond to the system, so service.run needs to be called early.

## Child process
Able to start another node process running on the desktop as the current user ([startUserProcess](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L179))
* Get the console session, then user token for that session.
* Pass the user token, and default desktop, to CreateProcessAsUser.
* Also pass the file handles for the pipe.

## Bonus
~~With minor modifications to the os-service module, it's possible to make a service receive a notification when a user logs in and then automatically start GPII.~~
**Done**: [stegru/node-os-service#GPII-2338](https://github.com/stegru/node-os-service/tree/GPII-2338)



