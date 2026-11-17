# Proem Quiz – próba na własnym komputerze (Windows + Docker Desktop).
# Uruchom w PowerShell w folderze z kodem:
#   powershell -ExecutionPolicy Bypass -File scripts\local-start.ps1 -Admin twoj@email.pl -Name "Imię Nazwisko"
# Bez -Admin skrypt tylko uruchamia aplikację (np. po ponownym pobraniu kodu).
# Zatrzymanie:  docker compose -f docker-compose.local.yml --env-file .env.local down
param(
	[string]$Admin = '',
	[string]$Name = 'Administrator'
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$compose = @('compose', '-f', 'docker-compose.local.yml', '--env-file', '.env.local')

function Step($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

Step 'Docker'
try { docker info *> $null } catch { }
if ($LASTEXITCODE -ne 0) { throw 'Docker nie odpowiada – uruchom Docker Desktop i poczekaj na „Engine running”.' }
Write-Host 'Docker działa.'

Step 'Adres komputera w sieci Wi-Fi'
$ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
	Select-Object -First 1).IPv4Address.IPAddress
if (-not $ip) { $ip = Read-Host 'Nie wykryłem adresu – podaj go (ipconfig → Adres IPv4)' }
Write-Host "Adres: $ip  (telefony muszą być w tej samej sieci)"

Step 'Plik .env.local'
$origin = "http://${ip}:3000"
if (Test-Path .env.local) {
	$lines = Get-Content .env.local | Where-Object { $_ -notmatch '^ORIGIN=' }
	$lines = @("ORIGIN=$origin") + $lines
	Write-Host 'Istnieje – aktualizuję tylko adres.'
} else {
	$bytes = New-Object byte[] 32
	[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
	$lines = @("ORIGIN=$origin", "TOTP_ENCRYPTION_KEY=$([Convert]::ToBase64String($bytes))")
	Write-Host 'Utworzony (z losowym kluczem – tylko do prób).'
}
# Bez znacznika BOM – Docker czyta wtedy plik poprawnie.
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.env.local'), [string[]]$lines, (New-Object Text.UTF8Encoding $false))

Step 'Budowanie i uruchomienie (pierwszy raz kilka minut)'
docker @compose up --build -d
if ($LASTEXITCODE -ne 0) { throw 'Uruchomienie nie powiodło się – wklej ten komunikat Claude.' }
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
	try { if ((Invoke-WebRequest -UseBasicParsing "http://localhost:3000/health" -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break } } catch { }
	Start-Sleep -Seconds 2
}
if (-not $ok) { docker @compose logs --tail 40 app; throw 'Aplikacja nie odpowiada – wklej powyższe logi Claude.' }
Write-Host 'Aplikacja działa.'

if ($Admin) {
	Step 'Konto administratora i przykładowe quizy'
	docker @compose exec -T app node server/cli.js create-admin $Admin $Name
	docker @compose exec -T app node server/cli.js demo-quiz $Admin
}

Step 'Gotowe'
Write-Host "Panel:  http://${ip}:3000/panel   (otwieraj przez ten adres, nie localhost)" -ForegroundColor Green
if ($Admin) { Write-Host 'Otwórz link aktywacyjny powyżej, ustaw hasło i zeskanuj kod QR aplikacją do kodów.' }
Write-Host 'Jeśli telefony nie mogą się połączyć: Ustawienia Windows → Sieć → Wi-Fi → typ profilu „Prywatna”.'
