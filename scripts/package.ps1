$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    & node scripts/check.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Source checks failed' }
    & node --test
    if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed' }
    & (Join-Path $PSScriptRoot 'Test-Update.ps1')
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version' }
    $out = Join-Path $root 'dist'
    New-Item -ItemType Directory -Path $out -Force | Out-Null
    $zipPath = Join-Path $out "Expression-Studio-$version.zip"
    # Explicit allowlist: no repository history, tests, credentials or local artifacts.
    $files = @('index.html','AE-ExpressionEditor-README.html','README.md','THIRD-PARTY-NOTICES.md','scripts/Update-ExpressionStudio.ps1','docs/UPDATES.md','docs/REVIEW.md','docs/AE-TEST-PLAN.md')
    foreach ($dir in @('CSXS','css','js','jsx','lib','script_editor')) {
        $files += Get-ChildItem -LiteralPath (Join-Path $root $dir) -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName) }
    }
    Add-Type -AssemblyName System.IO.Compression
    $stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in ($files | Sort-Object)) {
            $entry = $zip.CreateEntry('AE-ExpressionEditor/' + $file.Replace('\','/'))
            $entry.LastWriteTime = [DateTimeOffset]::new(2026,1,1,0,0,0,[TimeSpan]::Zero)
            $target = $entry.Open()
            $source = [IO.File]::OpenRead((Join-Path $root $file))
            try { $source.CopyTo($target) } finally { $source.Dispose(); $target.Dispose() }
        }
    } finally { $zip.Dispose(); $stream.Dispose() }
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($zipPath))" | Set-Content (Join-Path $out 'SHA256SUMS.txt') -Encoding ascii
    Write-Output "Packaged $zipPath"
} finally { Pop-Location }
