Option Explicit

Dim shell
Set shell = CreateObject("WScript.Shell")

' Window style 0 keeps the minute dispatcher completely hidden.
shell.Run """C:\xampp\php\php.exe"" ""C:\xampp\htdocs\WomenonWheels\WomenonWheels\process_scheduled_rides.php""", 0, True

Set shell = Nothing
