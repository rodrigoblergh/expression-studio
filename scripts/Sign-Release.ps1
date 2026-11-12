[CmdletBinding()]
param([Parameter(Mandatory)][string]$Package,[Parameter(Mandatory)][string]$PrivateKey,[int]$ValidDays=180)
$ErrorActionPreference='Stop'
if ($ValidDays -lt 1 -or $ValidDays -gt 365) { throw 'Validity must be 1–365 days.' }
$item=Get-Item -LiteralPath $Package
if ($item.Name -notmatch '^Expression-Studio-(\d+\.\d+\.\d+)\.zip$') { throw 'Unexpected package name.' }
$version=$Matches[1]; $now=[DateTimeOffset]::UtcNow
$data=[ordered]@{schemaVersion=1;extensionId='com.aeexpressioneditor.panel';version=$version;assetName=$item.Name;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant();size=$item.Length;releaseUrl="https://github.com/rodrigoblergh/expression-studio/releases/tag/v$version";publishedAt=$now.ToString('o');expiresAt=$now.AddDays($ValidDays).ToString('o')}
$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($data|ConvertTo-Json -Compress))
$rsa=[Security.Cryptography.RSA]::Create()
try { $rsa.ImportFromPem([IO.File]::ReadAllText($PrivateKey)); $signature=$rsa.SignData($bytes,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1) } finally {$rsa.Dispose()}
$manifest=Join-Path $item.DirectoryName 'update-manifest.json'; $sig=Join-Path $item.DirectoryName 'update-manifest.sig'
[IO.File]::WriteAllBytes($manifest,$bytes); [IO.File]::WriteAllText($sig,[Convert]::ToBase64String($signature),[Text.UTF8Encoding]::new($false))
. (Join-Path $PSScriptRoot 'Verify-Update.ps1')
$verified=Read-VerifiedUpdateManifest $manifest $sig
Write-Output "Signed and verified release $($verified.version)."
