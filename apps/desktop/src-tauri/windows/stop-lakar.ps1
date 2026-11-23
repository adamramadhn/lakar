# Hentikan proses Lakar yang image-nya berada di dalam direktori tertentu, lalu tunggu sampai file executable
# tidak terkunci lagi. Dipanggil hook installer NSIS (installer-hooks.nsh) sebelum file disalin/dihapus.
#
# Parameter lewat env (bukan argumen, agar path dengan spasi/kutip aman):
#   LAKAR_STOP_DIRS   direktori dipisah '|' (mis. $INSTDIR); hanya proses dengan ExecutablePath di dalamnya yang disentuh
#   LAKAR_STOP_NAMES  nama image dipisah '|' (mis. lakar.exe|lakar-node.exe)
#   LAKAR_STOP_MAIN   nama image aplikasi utama (untuk -Mode check)
#
# -Mode check : exit 2 bila aplikasi utama berjalan dari salah satu direktori, selain itu 0 (tanpa menghentikan apa pun).
# -Mode stop  : hentikan target; exit 0 bila bersih, 1 bila masih terkunci setelah batas waktu (file terkunci lalu
#               diganti nama menjadi *.old agar installer tetap bisa menulis file baru).
param([ValidateSet('check', 'stop')][string]$Mode = 'stop', [int]$TimeoutSec = 15, [int]$GraceSec = 2)

$ErrorActionPreference = 'Continue'
$dirs = @($env:LAKAR_STOP_DIRS -split '\|' | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') + '\' })
$names = @($env:LAKAR_STOP_NAMES -split '\|' | Where-Object { $_ })
if ($dirs.Count -eq 0 -or $names.Count -eq 0) { exit 0 }

# Proses bernama $names yang ExecutablePath-nya di dalam $dirs. Proses milik pengguna lain/elevated tanpa
# ExecutablePath terbaca dilewati (tidak bisa dihentikan dari sini juga).
function Get-Targets([string[]]$imageNames) {
  $filter = ($imageNames | ForEach-Object { "Name='" + $_.Replace("'", "''") + "'" }) -join ' OR '
  @(Get-CimInstance -ClassName Win32_Process -Filter $filter -ErrorAction SilentlyContinue | Where-Object {
      $exe = $_.ExecutablePath
      $exe -and @($dirs | Where-Object { $exe.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
    })
}

# File executable yang masih terkunci (image proses yang berjalan tidak bisa dibuka untuk tulis).
function Get-LockedFiles {
  foreach ($d in $dirs) {
    foreach ($n in $names) {
      $f = Join-Path $d $n
      if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { continue }
      try { [IO.File]::Open($f, 'Open', 'ReadWrite', 'None').Dispose() } catch { $f }
    }
  }
}

if ($Mode -eq 'check') {
  if ($env:LAKAR_STOP_MAIN -and (Get-Targets @($env:LAKAR_STOP_MAIN)).Count -gt 0) { exit 2 }
  exit 0
}

$start = Get-Date
while ($true) {
  $elapsed = ((Get-Date) - $start).TotalSeconds
  $targets = Get-Targets $names
  $locked = @(Get-LockedFiles)
  if ($targets.Count -eq 0 -and $locked.Count -eq 0) {
    # Sisa penggantian nama dari upgrade sebelumnya.
    foreach ($d in $dirs) { Get-ChildItem -LiteralPath $d -Filter '*.old' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*.old' } | Remove-Item -Force -ErrorAction SilentlyContinue }
    Write-Output 'Lakar: no running processes hold the install files.'
    exit 0
  }
  if ($elapsed -ge $TimeoutSec) { break }
  foreach ($t in $targets) {
    # Daemon berhenti sendiri saat aplikasi utama mati (stdin tertutup): beri waktu singkat agar keluar rapi.
    if ($elapsed -lt $GraceSec -and $t.CommandLine -match '[\\/]sidecar[\\/]daemon[\\/]') { continue }
    Write-Output ('Lakar: stopping PID {0} ({1})' -f $t.ProcessId, $t.ExecutablePath)
    Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 250
}

# Masih terkunci (mis. proses elevated/pengguna lain): Windows mengizinkan mengganti nama executable yang berjalan,
# jadi geser ke *.old agar File installer tidak gagal. Dibersihkan pada upgrade/uninstall berikutnya.
foreach ($f in @(Get-LockedFiles)) {
  $to = '{0}.{1}.old' -f (Split-Path -Leaf $f), [DateTime]::UtcNow.Ticks
  try {
    Rename-Item -LiteralPath $f -NewName $to -ErrorAction Stop
    Write-Output ('Lakar: {0} is still in use; renamed to {1}' -f $f, $to)
  } catch {
    Write-Output ('Lakar: {0} is still in use and could not be renamed: {1}' -f $f, $_.Exception.Message)
  }
}
exit 1
