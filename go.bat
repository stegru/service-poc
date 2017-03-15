@echo off

node test-service.js install

net start test-service

echo Press the any key to stop the service
pause >nul

net stop test-service

node test-service.js uninstall


