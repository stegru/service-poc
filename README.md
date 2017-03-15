# service-poc
Proof of concept for running a service, and starting a child process in the context of the current user.

## Service creation
It's been easy to create a service with node, thanks to the [os-service](https://github.com/stephenwvickers/node-os-service) npm module.
* Installing it is just a case of executing a few lines of code as Administrator (the installer can invoke this). [test-service.js:19](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L19)
* When starting the service, I think there's about 3 second limit for a new service respond to the system, so service.run needs to be called early.

## Child process
Able to start another node process running on the desktop as the current user ([startUserProcess](https://github.com/stegru/service-poc/blob/02159a6396deefe03a3039dd1ed126f166f456d5/test-service.js#L179))
* Get the console session, then user token for that session.
* Pass the user token, and default desktop, to CreateProcessAsUser.
* Also pass the file handles for the pipe.

## Anonymous Pipe
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

## Bonus
With minor modifications to the os-service module, it's possible to make a service receive a notification when a user logs in and then automatically start GPII.


