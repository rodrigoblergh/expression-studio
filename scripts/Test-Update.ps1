$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Update-ExpressionStudio.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path ([IO.Path]::GetTempPath()) ('ExpressionStudio-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$script:passed = 0
function Assert-True($Value, $Message) { if (!$Value) { throw $Message }; $script:passed++ }
function Assert-Rejected([scriptblock]$Action, $Message) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Assert-True $rejected $Message
}
function New-TestPackage([string]$Name, [string[]]$Extra = @(), [string]$Version = '1.2.3') {
    $path = Join-Path $root "$Name.zip"
    $zip = [IO.Compression.ZipFile]::Open($path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $entries = @{'AE-ExpressionEditor/CSXS/manifest.xml' = "<ExtensionManifest ExtensionBundleId=`"com.aeexpressioneditor.panel`" ExtensionBundleVersion=`"$Version`"/>"; 'AE-ExpressionEditor/index.html'='<html></html>'}
        foreach ($key in $entries.Keys) { $entry = $zip.CreateEntry($key); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write($entries[$key]) } finally { $writer.Dispose() } }
        foreach ($key in $Extra) { $entry = $zip.CreateEntry($key); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write('bad') } finally { $writer.Dispose() } }
    } finally { $zip.Dispose() }
    return $path
}
$valid = New-TestPackage 'valid'
$stage = Join-Path $root 'valid-stage'
Expand-ExpressionStudioPackage $valid $stage '1.2.3'
Assert-True ((Get-ExpressionStudioManifestVersion $stage).ToString() -eq '1.2.3') 'Valid package failed.'
foreach ($unsafe in @('AE-ExpressionEditor/../escape.js','other/index.html','AE-ExpressionEditor/C:\escape','AE-ExpressionEditor/a/../../escape','AE-ExpressionEditor/NUL.txt','AE-ExpressionEditor/trailing.','AE-ExpressionEditor//double','AE-ExpressionEditor/INDEX.HTML')) {
    $id = [guid]::NewGuid().ToString('N'); $archive=New-TestPackage $id @($unsafe)
    Assert-Rejected { Expand-ExpressionStudioPackage $archive (Join-Path $root "$id-stage") '1.2.3' } "Unsafe path accepted: $unsafe"
}
Assert-Rejected { Expand-ExpressionStudioPackage $valid (Join-Path $root 'wrong-version') '1.2.4' } 'Wrong version accepted.'
Assert-Rejected { Assert-ExpressionStudioPath (Join-Path $root 'unrelated') } 'Unrelated folder accepted.'
$checksum = Join-Path $root 'SHA256SUMS.txt'
$hash = (Get-FileHash $valid -Algorithm SHA256).Hash
"$hash  Expression-Studio-1.2.3.zip" | Set-Content $checksum
Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip'; $script:passed++
('0' * 64 + '  Expression-Studio-1.2.3.zip') | Set-Content $checksum
Assert-Rejected { Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip' } 'Bad checksum accepted.'
@("$hash  Expression-Studio-1.2.3.zip", "$hash  Expression-Studio-1.2.3.zip") | Set-Content $checksum
Assert-Rejected { Assert-ExpressionStudioChecksum $valid $checksum 'Expression-Studio-1.2.3.zip' } 'Duplicate checksum accepted.'
Write-Output "PASS: $script:passed updater validation checks. Temporary fixtures: $root"
