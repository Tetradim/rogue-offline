@echo off
REM Runs postbuild.js via Node.js explicitly.
REM
REM Why this exists: double-clicking a .js file in Windows Explorer runs it
REM through Windows Script Host (an old built-in engine for .js/.vbs files),
REM NOT through Node.js, even if Node is installed. WSH's JScript engine
REM doesn't understand modern JavaScript at all (import/export, etc.), so it
REM fails immediately with "Syntax error" at the first import statement.
REM
REM You almost never need to run this manually — `npm run build` already
REM calls it automatically as its "postbuild" step. This wrapper exists for
REM the rare case you want to re-run it standalone (e.g. after manually
REM editing dist/ or pokemon_data.json).
node postbuild.js
pause
