# service-poc
Proof of concept for running a service, and starting a child process in the context of the current user.

## Sockets
This branch experiments with using sockets.

* Only binding to 127.0.0.1, blocking outsiders.
* Secured by inspecting the TCP table and verifying the PID at the other end is the child process.
* An ephemeral port is used to guard against squatting.
* Can be used in a way that's natural to node (it's asynchronous).

```javascript
server.listen(0, "127.0.0.1", function () {
    port = server.address().port;
});
```


## Other IPC methods

### Named pipes (node.js built-in) 
Name pipe support is built into node, but accepts any process without the ability to identify/restrict/validate the client.
```javascript
server.listen("\\\\?\\pipe\\mypipe");
```

### Named pipes (Windows API)
Able to secure the pipe, but not able to use it in an async manner. Requires polling/waiting even when using the asynchronous API functions [ReadFileEx](https://msdn.microsoft.com/library/aa365468).


### Anonymous Pipe
Unable to use anonymous pipes, because the handles can't be shared over different sessions.
 [CreateProcessAsUser](https://msdn.microsoft.com/library/ms682429): You cannot inherit handles across sessions. Additionally, if this parameter is TRUE, you must create the process in the same session as the caller.

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
With minor modifications to the os-service module, it's possible to make a service receive a notification when a user logs in and then automatically start GPII.


