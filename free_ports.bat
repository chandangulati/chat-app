@echo off
setlocal
set PORTS=3001 3002 4000 49152
for %%P in (%PORTS%) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%P') do (
        echo Killing process on port %%P with PID %%a
        taskkill /PID %%a /F
    )
)
echo All specified ports are now free (if any process was using them).
endlocal
pause
