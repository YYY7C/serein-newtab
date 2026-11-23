# 把 src/ 打成可以直接上传到 Chrome Web Store / Edge Add-ons 的 zip。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File scripts\package.ps1
#
# 产物：dist/serein-newtab-v<manifest.version>.zip
# 要点：manifest.json 必须在 zip 根目录（不能带 src/ 这一层）；
#       条目路径一律用 /，避免部分解压器把 \ 当成文件名。

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'src'
$manifestPath = Join-Path $src 'manifest.json'

if (-not (Test-Path $manifestPath)) {
	throw "找不到 $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $manifest.version) {
	throw 'manifest.json 里没有 version 字段'
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$zipPath = Join-Path $dist ('serein-newtab-v{0}.zip' -f $manifest.version)
if (Test-Path $zipPath) {
	Remove-Item $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$srcFull = (Resolve-Path $src).Path.TrimEnd('\')
$count = 0

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
	Get-ChildItem -Path $src -Recurse -File | Sort-Object FullName | ForEach-Object {
		$relative = $_.FullName.Substring($srcFull.Length + 1) -replace '\\', '/'
		[void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
			$zip,
			$_.FullName,
			$relative,
			[System.IO.Compression.CompressionLevel]::Optimal
		)
		$count++
	}
}
finally {
	$zip.Dispose()
}

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host ('已打包 {0} 个文件 -> {1} ({2} KB)' -f $count, $zipPath, $sizeKb)
Write-Host '上传前请确认 manifest.json 的 version 已经递增。'
