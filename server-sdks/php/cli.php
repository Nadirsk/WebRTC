<?php
// php cli.php APP_ID APP_CERTIFICATE CHANNEL UID ROLE [EXPIRE_SECONDS]  (used by the cross-language test)
require __DIR__ . '/src/TokenBuilder.php';
echo \NadirNetwork\ServerSdk\TokenBuilder::build($argv[1], $argv[2], $argv[3], $argv[4], $argv[5], (int) ($argv[6] ?? 3600));
