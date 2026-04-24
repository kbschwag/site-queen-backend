<?php
// SiteQueen Hostinger upload receiver.
//
// Upload this file ONCE to Hostinger via hPanel → File Manager:
//   /public_html/_sq_upload.php
//
// Then in Lovable → Project → Backend → Secrets, set:
//   HOSTINGER_UPLOAD_URL    = https://your-domain.com/_sq_upload.php
//   HOSTINGER_UPLOAD_SECRET = a long random string (must match SHARED_SECRET below)
//
// The shared secret in this file MUST match the HOSTINGER_UPLOAD_SECRET env
// var on the Lovable side. After editing, re-upload via hPanel.

const SHARED_SECRET = 'REPLACE_ME_WITH_THE_SAME_VALUE_AS_HOSTINGER_UPLOAD_SECRET';

// Public_html absolute path. On Hostinger this is usually
//   /home/u123456789/domains/your-domain.com/public_html
// but $_SERVER['DOCUMENT_ROOT'] resolves it automatically.
$ROOT = rtrim($_SERVER['DOCUMENT_ROOT'], '/');

header('Content-Type: application/json');

// -------------------------------------------------------------------------
// Auth
// -------------------------------------------------------------------------
$provided = $_SERVER['HTTP_X_UPLOAD_SECRET'] ?? '';
if (!hash_equals(SHARED_SECRET, $provided)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required']);
    exit;
}

// -------------------------------------------------------------------------
// Parse body
// -------------------------------------------------------------------------
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Body shape: { "files": [ { "path": "/public_html/...", "content_b64": "..." }, ... ] }
$files = $body['files'] ?? null;
if (!is_array($files) || count($files) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'No files provided']);
    exit;
}

// -------------------------------------------------------------------------
// Path safety: all writes must stay inside /public_html
// -------------------------------------------------------------------------
function safe_resolve($root, $remotePath) {
    // Strip leading "/public_html" if caller included it (it almost always
    // does), then anchor everything below DOCUMENT_ROOT.
    $rel = $remotePath;
    if (strpos($rel, '/public_html/') === 0) {
        $rel = substr($rel, strlen('/public_html'));
    }
    if (strpos($rel, '/') !== 0) {
        $rel = '/' . $rel;
    }
    // Reject path traversal.
    if (strpos($rel, '..') !== false) {
        return null;
    }
    return $root . $rel;
}

$written = [];
$failed = [];

foreach ($files as $f) {
    $remotePath = (string)($f['path'] ?? '');
    $b64 = (string)($f['content_b64'] ?? '');
    if ($remotePath === '' || $b64 === '') {
        $failed[] = ['path' => $remotePath, 'error' => 'missing path or content_b64'];
        continue;
    }
    $abs = safe_resolve($ROOT, $remotePath);
    if ($abs === null) {
        $failed[] = ['path' => $remotePath, 'error' => 'unsafe path'];
        continue;
    }
    $content = base64_decode($b64, true);
    if ($content === false) {
        $failed[] = ['path' => $remotePath, 'error' => 'bad base64'];
        continue;
    }
    $dir = dirname($abs);
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        $failed[] = ['path' => $remotePath, 'error' => "mkdir failed: $dir"];
        continue;
    }
    if (file_put_contents($abs, $content) === false) {
        $failed[] = ['path' => $remotePath, 'error' => 'write failed'];
        continue;
    }
    @chmod($abs, 0644);
    $written[] = $remotePath;
}

http_response_code(count($failed) === 0 ? 200 : 207);
echo json_encode([
    'ok' => count($failed) === 0,
    'written' => $written,
    'failed' => $failed,
]);
