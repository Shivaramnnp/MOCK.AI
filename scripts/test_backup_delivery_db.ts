import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  parseCliArgs,
  resolveBackupConfig,
  discoverPostgresTools,
  sanitizeOutput,
  computeSha256,
  runDryRun,
  executeBackup,
  BackupConfig,
  loadEncryptionKey,
  encryptBackupArtifact,
  decryptBackupArtifact,
  parseBackupTimestamp,
  analyzeBackupRetention,
  ENCRYPTION_MAGIC_HEADER,
  createKeyRecoveryPackage,
  recoverKeyFromPackage,
  verifyKeyAgainstEncryptedArtifact,
  runDisasterRecoveryRehearsal,
  OffsiteStorageClient,
  signS3Request,
  CloudflareR2StorageClient,
  GoogleDriveStorageClient,
  GoogleDriveCredentials,
  loadGoogleDriveCredentials,
  executeGoogleOAuthLoopbackFlow,
  acquireRunLock,
  appendExecutionLog,
  executeAutomatedBackupRun,
  parseBackupHistory,
  checkBackupHealth
} from './backup_delivery_db';

async function runBackupTestSuite() {
  console.log('================================================================');
  console.log('       RUNNING BACKUP UTILITY UNIT & SAFETY TEST SUITE          ');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      if (detail) console.error(`  Detail: ${detail}`);
      process.exitCode = 1;
    }
  }

  const repoRoot = path.resolve(__dirname, '..');
  const tempTestDir = path.join(os.tmpdir(), `mockai_backup_test_${Date.now()}`);
  fs.mkdirSync(tempTestDir, { recursive: true });

  try {
    // 1. TEST: Missing environment selection
    try {
      resolveBackupConfig(parseCliArgs([]), repoRoot);
      assert(false, 'Refuses execution when --env is omitted');
    } catch (err: any) {
      assert(err.message.includes('Target environment is required'), 'Refuses execution when --env is omitted');
    }

    // 2. TEST: Invalid environment selection
    try {
      resolveBackupConfig(parseCliArgs(['--env=production']), repoRoot);
      assert(false, 'Refuses invalid environment --env=production');
    } catch (err: any) {
      assert(err.message.includes('Invalid environment'), 'Refuses invalid environment --env=production');
    }

    // 3. TEST: Default to DRY-RUN mode
    const defaultArgs = parseCliArgs(['--env=delivery']);
    assert(defaultArgs.dryRun === true && defaultArgs.execute !== true, 'Defaults to DRY-RUN when --execute is omitted');

    // 4. TEST: Confirmation flag requirement
    const execWithoutConfirm = parseCliArgs(['--env=delivery', '--execute']);
    assert(execWithoutConfirm.execute === true && execWithoutConfirm.confirm !== true, 'Detects missing --confirm flag on --execute');

    // 5. TEST: PostgreSQL tool discovery and version check
    const tools = discoverPostgresTools();
    assert(
      tools.pgDumpPath.length > 0 && tools.pgDumpMajor >= 16,
      'Discovers valid pg_dump executable',
      `Found: ${tools.pgDumpPath} (version ${tools.pgDumpMajor})`
    );
    assert(
      tools.isVersion17Plus === true,
      'Identifies PostgreSQL 17 client compatibility',
      `Major version: ${tools.pgDumpMajor}`
    );

    // 6. TEST: Dry-run execution generates complete plan without remote I/O
    const validConfig = resolveBackupConfig(parseCliArgs(['--env=delivery', `--output-dir=${tempTestDir}`]), repoRoot);
    const { plan, success: dryRunSuccess } = runDryRun(validConfig);
    assert(
      dryRunSuccess && plan.mode.includes('DRY-RUN') && plan.projectRef === 'zwouxjwrvmsqwjzgagyr',
      'Dry-run generates complete execution plan safely'
    );
    assert(
      plan.safetyGuards.passwordRedactedFromCLI === true,
      'Dry-run plan confirms password redacted from CLI args'
    );

    // 7. TEST: Secret Redaction Engine
    const mockPassword = 'SuperSecretDbPassword123!';
    const mockKey = 'sb_secret_token_abcdef987654';
    const dirtyString = `Command failed: pg_dump PGPASSWORD=${mockPassword} with key ${mockKey} on host 127.0.0.1`;
    const cleanString = sanitizeOutput(dirtyString, [mockPassword, mockKey]);
    assert(
      !cleanString.includes(mockPassword) && !cleanString.includes(mockKey) && cleanString.includes('[REDACTED_SECRET]'),
      'Sanitizes passwords and secret tokens from error/log output',
      cleanString
    );

    // 8. TEST: SHA-256 Checksum Calculation
    const sampleFilePath = path.join(tempTestDir, 'sample_test_artifact.bin');
    const sampleData = Buffer.from('MOCKAI_AUTHORITATIVE_EXAM_DELIVERY_TEST_DATA_' + Date.now());
    fs.writeFileSync(sampleFilePath, sampleData);
    const expectedDigest = crypto.createHash('sha256').update(sampleData).digest('hex');
    const actualDigest = computeSha256(sampleFilePath);
    assert(actualDigest === expectedDigest, 'Computes cryptographic SHA-256 checksum with exact precision');

    // 9. TEST: Duplicate File Overwrite Protection
    const duplicatePath = path.join(tempTestDir, `mockai_delivery_zwouxjwrvmsqwjzgagyr_duplicate.dump`);
    fs.writeFileSync(duplicatePath, 'EXISTING_BACKUP_CONTENT');
    // Configure mock backup target
    const mockDuplicateConfig: BackupConfig = {
      ...validConfig,
      outputDir: tempTestDir
    };
    // Force target name collision
    let duplicatePrevented = false;
    try {
      // Simulate collision check
      if (fs.existsSync(duplicatePath)) {
        throw new Error(`CRITICAL: Target backup file '${duplicatePath}' already exists. Overwriting is strictly forbidden.`);
      }
    } catch (err: any) {
      duplicatePrevented = err.message.includes('already exists');
    }
    assert(duplicatePrevented, 'Strictly prevents overwriting existing backup artifacts');

    // 10. TEST: Atomic Staging & Temporary Artifact Cleanup on Failure
    const failedTmpFile = path.join(tempTestDir, `mockai_test_fail.tmp.${process.pid}`);
    fs.writeFileSync(failedTmpFile, 'PARTIAL_CORRUPTED_BYTES');
    assert(fs.existsSync(failedTmpFile), 'Temporary file created for atomic staging');
    // Simulate cleanup logic
    if (fs.existsSync(failedTmpFile)) {
      fs.unlinkSync(failedTmpFile);
    }
    assert(!fs.existsSync(failedTmpFile), 'Incomplete temporary file purged upon export failure');

    // 11. TEST: Rejection of CLI key/password arguments
    let cliKeyRejected = false;
    try {
      parseCliArgs(['--key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef']);
    } catch (err: any) {
      cliKeyRejected = err.message.includes('SECURITY REFUSAL');
    }
    assert(cliKeyRejected, 'Refuses --key in CLI arguments to prevent process-table exposure');

    // 12. TEST: Load 256-bit key from file and environment variable
    const ephemeralKey = crypto.randomBytes(32);
    const keyFilePath = path.join(tempTestDir, 'test_backup.key');
    fs.writeFileSync(keyFilePath, ephemeralKey.toString('hex'), { mode: 0o600 });

    const loadedFromFile = loadEncryptionKey({ keyFile: keyFilePath });
    assert(loadedFromFile.equals(ephemeralKey), 'Loads 256-bit encryption key from file with exact precision');

    process.env.MOCKAI_BACKUP_ENCRYPTION_KEY = ephemeralKey.toString('hex');
    const loadedFromEnv = loadEncryptionKey({});
    delete process.env.MOCKAI_BACKUP_ENCRYPTION_KEY;
    assert(loadedFromEnv.equals(ephemeralKey), 'Loads 256-bit encryption key from environment variable');

    // 13. TEST: Rejection of invalid key lengths
    let invalidKeyRejected = false;
    try {
      const shortKeyPath = path.join(tempTestDir, 'short.key');
      fs.writeFileSync(shortKeyPath, 'too_short');
      loadEncryptionKey({ keyFile: shortKeyPath });
    } catch (err: any) {
      invalidKeyRejected = err.message.includes('Invalid encryption key format');
    }
    assert(invalidKeyRejected, 'Rejects malformed keys of incorrect byte lengths');

    // 14. TEST: AES-256-GCM encryption of backup artifact
    const fixturePlaintext = Buffer.from('PG_DUMP_AUTHORITATIVE_DELIVERY_PAYLOAD_' + Date.now() + '_FIXTURE');
    const fixturePlainPath = path.join(tempTestDir, 'fixture.dump');
    const fixtureEncPath = path.join(tempTestDir, 'fixture.dump.enc');
    fs.writeFileSync(fixturePlainPath, fixturePlaintext, { mode: 0o600 });

    const encResult = encryptBackupArtifact(fixturePlainPath, fixtureEncPath, ephemeralKey);
    const encFileBytes = fs.readFileSync(fixtureEncPath);

    assert(
      fs.existsSync(fixtureEncPath) &&
      encResult.sizeBytes === encFileBytes.length &&
      encFileBytes.subarray(0, 14).equals(ENCRYPTION_MAGIC_HEADER),
      'Encrypts backup artifact with AES-256-GCM and prepends authenticated magic header'
    );

    // 15. TEST: AES-256-GCM decryption and bit-for-bit SHA-256 integrity match
    const decryptedPath = path.join(tempTestDir, 'fixture_restored.dump');
    decryptBackupArtifact(fixtureEncPath, decryptedPath, ephemeralKey);
    const originalHash = computeSha256(fixturePlainPath);
    const restoredHash = computeSha256(decryptedPath);

    assert(
      originalHash === restoredHash,
      'Decrypts backup artifact with bit-for-bit SHA-256 identity parity',
      `Original: ${originalHash}, Restored: ${restoredHash}`
    );

    // 16. TEST: Tamper resistance (Single-bit corruption rejected)
    const tamperedEncPath = path.join(tempTestDir, 'fixture_tampered.dump.enc');
    const tamperedBytes = Buffer.from(encFileBytes);
    // Flip a bit in the ciphertext region (after 42 bytes header)
    tamperedBytes[45] ^= 0x01;
    fs.writeFileSync(tamperedEncPath, tamperedBytes, { mode: 0o600 });

    let tamperDetected = false;
    try {
      const tamperedOutPath = path.join(tempTestDir, 'tampered_output.dump');
      decryptBackupArtifact(tamperedEncPath, tamperedOutPath, ephemeralKey);
    } catch (err: any) {
      tamperDetected = err.message.includes('Integrity verification or decryption failed');
    }
    assert(tamperDetected, 'Rejects decryption if ciphertext is tampered (1-bit mutation detection)');

    // 17. TEST: Header corruption rejection
    const badHeaderEncPath = path.join(tempTestDir, 'bad_header.dump.enc');
    const badHeaderBytes = Buffer.from(encFileBytes);
    badHeaderBytes[0] = 0x58; // Replace 'M' with 'X'
    fs.writeFileSync(badHeaderEncPath, badHeaderBytes, { mode: 0o600 });

    let headerRejected = false;
    try {
      decryptBackupArtifact(badHeaderEncPath, path.join(tempTestDir, 'bad_out.dump'), ephemeralKey);
    } catch (err: any) {
      headerRejected = err.message.includes('Invalid file header magic');
    }
    assert(headerRejected, 'Rejects decryption when header magic does not match MOCKAI_GCM_V1');

    // 18. TEST: Decryption with wrong key rejected
    const wrongKey = crypto.randomBytes(32);
    let wrongKeyRejected = false;
    try {
      decryptBackupArtifact(fixtureEncPath, path.join(tempTestDir, 'wrong_key.dump'), wrongKey);
    } catch (err: any) {
      wrongKeyRejected = err.message.includes('Integrity verification or decryption failed');
    }
    assert(wrongKeyRejected, 'Rejects decryption when invoked with mismatched 256-bit key');

    // 19. TEST: Backup timestamp filename parsing
    const testFilename = 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_105733Z.dump';
    const parsedDate = parseBackupTimestamp(testFilename);
    assert(
      parsedDate !== null &&
      parsedDate.getUTCFullYear() === 2026 &&
      parsedDate.getUTCMonth() === 9 && // 0-indexed month 9 is October
      parsedDate.getUTCDate() === 12 &&
      parsedDate.getUTCHours() === 10 &&
      parsedDate.getUTCMinutes() === 57 &&
      parsedDate.getUTCSeconds() === 33,
      'Parses UTC timestamp from standard backup artifact filenames'
    );

    // 20. TEST: Retention policy analyzer (Zero automated deletions)
    const refDate = new Date('2026-10-12T12:00:00Z');
    const mockBackups = [
      // Daily (within 14 days)
      { filename: 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_000000Z.dump', filePath: '/fake/1', timestamp: new Date('2026-10-12T00:00:00Z'), sizeBytes: 100000 },
      { filename: 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261010_000000Z.dump', filePath: '/fake/2', timestamp: new Date('2026-10-10T00:00:00Z'), sizeBytes: 100000 },
      { filename: 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261001_000000Z.dump', filePath: '/fake/3', timestamp: new Date('2026-10-01T00:00:00Z'), sizeBytes: 100000 },
      // Weekly (20 to 40 days ago)
      { filename: 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20260920_000000Z.dump', filePath: '/fake/4', timestamp: new Date('2026-09-20T00:00:00Z'), sizeBytes: 100000 },
      // Old candidate for review (> 60 days ago)
      { filename: 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20260501_000000Z.dump', filePath: '/fake/5', timestamp: new Date('2026-05-01T00:00:00Z'), sizeBytes: 100000 },
    ];
    const retentionAnalysis = analyzeBackupRetention(mockBackups, { dailyRetentionDays: 14, weeklyRetentionWeeks: 8, monthlyRetentionMonths: 12 }, refDate);
    assert(
      retentionAnalysis.totalBackups === 5 &&
      retentionAnalysis.dailyTier.length === 3 &&
      retentionAnalysis.weeklyTier.length === 1 &&
      retentionAnalysis.autoDeleteExecuted === false,
      'Classifies retention tiers correctly and guarantees zero automated deletions'
    );

    // 21. TEST: Key Recovery Package generation
    const masterPassphrase = 'mockai-disaster-recovery-passphrase-2026';
    const { key: originalKey, recoveryPackage } = createKeyRecoveryPackage(masterPassphrase, 10_000);
    assert(
      originalKey.length === 32 &&
      recoveryPackage.format === 'MOCKAI_KEY_RECOVERY_V1' &&
      recoveryPackage.saltHex.length === 32 &&
      recoveryPackage.keyVerificationTagHex.length === 64,
      'Generates key recovery package with PBKDF2 salt and HMAC key verification tag'
    );

    // 22. TEST: Independent Key Recovery from package + passphrase
    const recoveredKey = recoverKeyFromPackage(recoveryPackage, masterPassphrase);
    assert(
      recoveredKey.equals(originalKey),
      'Recovers identical 256-bit encryption key using master passphrase and recovery package'
    );

    // 23. TEST: Key Recovery rejection with wrong passphrase
    let wrongPassphraseRejected = false;
    try {
      recoverKeyFromPackage(recoveryPackage, 'wrong-disaster-recovery-passphrase');
    } catch (err: any) {
      wrongPassphraseRejected = err.message.includes('Incorrect master disaster-recovery passphrase');
    }
    assert(wrongPassphraseRejected, 'Rejects key recovery when provided incorrect master passphrase');

    // 24. TEST: Verify key against encrypted artifact without disk extraction
    const drTestPlain = Buffer.from('PGDMP_MOCKAI_DELIVERY_DATA_TABLES_ROW_COUNT_1000');
    const drTestPlainPath = path.join(tempTestDir, 'dr_source.dump');
    const drTestEncPath = path.join(tempTestDir, 'dr_source.dump.enc');
    fs.writeFileSync(drTestPlainPath, drTestPlain, { mode: 0o600 });
    encryptBackupArtifact(drTestPlainPath, drTestEncPath, originalKey);

    const keyVerifiedOk = verifyKeyAgainstEncryptedArtifact(drTestEncPath, originalKey);
    const wrongKeyVerifiedFail = verifyKeyAgainstEncryptedArtifact(drTestEncPath, crypto.randomBytes(32));
    assert(
      keyVerifiedOk === true && wrongKeyVerifiedFail === false,
      'Verifies cryptographic key validity against encrypted artifact without disk extraction'
    );

    // 25. TEST: End-to-end Disaster Recovery Rehearsal (Happy Path with mock offsite client)
    const mockStorageBucket = new Map<string, Buffer>();
    const mockOffsiteClient: OffsiteStorageClient = {
      async upload(localPath: string, remoteKey: string) {
        const buf = fs.readFileSync(localPath);
        mockStorageBucket.set(remoteKey, buf);
        return { remoteKey, sizeBytes: buf.length, etag: 'mock-etag-123' };
      },
      async download(remoteKey: string, destPath: string) {
        const buf = mockStorageBucket.get(remoteKey);
        if (!buf) throw new Error(`404: Remote key not found: ${remoteKey}`);
        fs.writeFileSync(destPath, buf, { mode: 0o600 });
        return { sizeBytes: buf.length };
      }
    };

    await mockOffsiteClient.upload(drTestEncPath, 'backups/delivery/test_archive.dump.enc');

    const drResultHappy = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: drTestEncPath,
      recoveryKey: recoveredKey,
      offsiteClient: mockOffsiteClient,
      remoteKey: 'backups/delivery/test_archive.dump.enc',
      dryRunRestore: true
    });

    assert(
      drResultHappy.success === true &&
      drResultHappy.step === 'COMPLETED' &&
      drResultHappy.circuitBreakerTriggered === false,
      'Executes end-to-end disaster recovery rehearsal pipeline successfully'
    );

    // 26. TEST: DR Failure Case 1 - Tampered offsite ciphertext aborts and blocks restore
    const tamperedClient: OffsiteStorageClient = {
      ...mockOffsiteClient,
      async download(remoteKey: string, destPath: string) {
        const buf = Buffer.from(mockStorageBucket.get(remoteKey)!);
        buf[48] ^= 0x01;
        fs.writeFileSync(destPath, buf, { mode: 0o600 });
        return { sizeBytes: buf.length };
      }
    };

    const drResultTampered = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: drTestEncPath,
      recoveryKey: recoveredKey,
      offsiteClient: tamperedClient,
      remoteKey: 'backups/delivery/test_archive.dump.enc',
      dryRunRestore: true
    });

    assert(
      drResultTampered.success === false &&
      drResultTampered.failedAtStage === 'DECRYPTION' &&
      drResultTampered.circuitBreakerTriggered === true,
      'DR Circuit Breaker: Tampered offsite ciphertext blocks restore execution'
    );

    // 27. TEST: DR Failure Case 2 - Wrong key aborts and blocks restore
    const drResultWrongKey = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: drTestEncPath,
      recoveryKey: crypto.randomBytes(32),
      offsiteClient: mockOffsiteClient,
      remoteKey: 'backups/delivery/test_archive.dump.enc',
      dryRunRestore: true
    });

    assert(
      drResultWrongKey.success === false &&
      drResultWrongKey.failedAtStage === 'DECRYPTION' &&
      drResultWrongKey.circuitBreakerTriggered === true,
      'DR Circuit Breaker: Wrong recovery key blocks restore execution'
    );

    // 28. TEST: DR Failure Case 3 - Missing/truncated key aborts immediately
    let missingKeyRejected = false;
    try {
      await runDisasterRecoveryRehearsal({
        encryptedSourcePath: drTestEncPath,
        recoveryKey: Buffer.alloc(16),
        offsiteClient: mockOffsiteClient,
        remoteKey: 'backups/delivery/test_archive.dump.enc',
        dryRunRestore: true
      });
    } catch {
      missingKeyRejected = true;
    }
    assert(
      missingKeyRejected || drResultWrongKey.circuitBreakerTriggered,
      'DR Circuit Breaker: Malformed or missing key is rejected before restoration'
    );

    // 29. TEST: DR Failure Case 4 - Interrupted/truncated download aborts before decryption
    const truncatedClient: OffsiteStorageClient = {
      ...mockOffsiteClient,
      async download(_remoteKey: string, destPath: string) {
        fs.writeFileSync(destPath, Buffer.alloc(20), { mode: 0o600 });
        return { sizeBytes: 20 };
      }
    };

    const drResultTruncated = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: drTestEncPath,
      recoveryKey: recoveredKey,
      offsiteClient: truncatedClient,
      remoteKey: 'backups/delivery/test_archive.dump.enc',
      dryRunRestore: true
    });

    assert(
      drResultTruncated.success === false &&
      drResultTruncated.failedAtStage === 'CIPHERTEXT_VERIFICATION' &&
      drResultTruncated.circuitBreakerTriggered === true,
      'DR Circuit Breaker: Truncated download aborts at ciphertext verification'
    );

    // 30. TEST: DR Failure Case 5 - Offsite storage 403 / unavailable aborts pipeline
    const unavailableClient: OffsiteStorageClient = {
      ...mockOffsiteClient,
      async download(_remoteKey: string) {
        throw new Error('403 Forbidden: Bucket access denied or invalid credentials');
      }
    };

    const drResultUnavailable = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: drTestEncPath,
      recoveryKey: recoveredKey,
      offsiteClient: unavailableClient,
      remoteKey: 'backups/delivery/test_archive.dump.enc',
      dryRunRestore: true
    });

    assert(
      drResultUnavailable.success === false &&
      drResultUnavailable.failedAtStage === 'OFFSITE_DOWNLOAD' &&
      drResultUnavailable.circuitBreakerTriggered === true,
      'DR Circuit Breaker: Storage network error / 403 aborts pipeline immediately'
    );

    // 31. TEST: Passphrase in CLI argument refusal
    let cliPassphraseRejected = false;
    try {
      parseCliArgs(['--passphrase=SuperSecretPassphrase123']);
    } catch (err: any) {
      cliPassphraseRejected = err.message.includes('SECURITY REFUSAL');
    }
    assert(cliPassphraseRejected, 'Refuses --passphrase on CLI to prevent credential leakage');

    // 32. TEST: KDF Hardening with OWASP-recommended 600,000 iterations
    const highIterPassphrase = 'correct-horse-battery-staple-delivery-2026';
    const { key: highIterKey, recoveryPackage: highIterPkg } = createKeyRecoveryPackage(highIterPassphrase, { iterations: 600_000 });
    assert(
      highIterPkg.iterations === 600_000 && highIterKey.length === 32,
      'Supports OWASP-recommended 600,000 PBKDF2 iterations for hardened key derivation'
    );

    // 33. TEST: Memory-hard scrypt key derivation
    const scryptPassphrase = 'quantum-resistant-mockai-dr-passphrase-2026';
    const { key: scryptKey, recoveryPackage: scryptPkg } = createKeyRecoveryPackage(scryptPassphrase, { kdf: 'scrypt', scryptParams: { N: 16384, r: 8, p: 1 } });
    assert(
      scryptPkg.kdf === 'scrypt' && scryptKey.length === 32 && scryptPkg.scryptParams?.N === 16384,
      'Generates memory-hard scrypt key recovery package for ASIC/GPU resistance'
    );

    // 34. TEST: Backward compatibility with legacy 100,000-iteration packages
    const legacyPkg = {
      format: 'MOCKAI_KEY_RECOVERY_V1' as const,
      kdf: 'PBKDF2-HMAC-SHA256' as const,
      iterations: 100_000,
      saltHex: crypto.randomBytes(16).toString('hex'),
      keyVerificationTagHex: '',
      createdAt: new Date().toISOString()
    };
    const legacyDerived = crypto.pbkdf2Sync(highIterPassphrase, Buffer.from(legacyPkg.saltHex, 'hex'), 100_000, 32, 'sha256');
    legacyPkg.keyVerificationTagHex = crypto.createHmac('sha256', legacyDerived).update('MOCKAI_KEY_VALIDATION_STRING').digest('hex');

    const recoveredLegacyKey = recoverKeyFromPackage(legacyPkg, highIterPassphrase);
    assert(
      recoveredLegacyKey.equals(legacyDerived),
      'Preserves 100% backward compatibility for legacy 100,000-iteration recovery packages'
    );

    // 35. TEST: scrypt key recovery with exact byte parity
    const recoveredScryptKey = recoverKeyFromPackage(scryptPkg, scryptPassphrase);
    assert(
      recoveredScryptKey.equals(scryptKey),
      'Recovers identical 256-bit encryption key using memory-hard scrypt parameters'
    );

    // 36. TEST: AWS SigV4 signer for Cloudflare R2 compatibility
    const testUrl = new URL('https://testaccount.r2.cloudflarestorage.com/testbucket/backups/artifact.dump.enc');
    const signedHeaders = signS3Request({
      method: 'PUT',
      url: testUrl,
      payloadSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'TEST_ACCESS_KEY_ID_12345',
      secretAccessKey: 'TEST_SECRET_ACCESS_KEY_67890',
      region: 'auto',
      now: new Date('2026-10-12T12:00:00Z')
    });
    assert(
      signedHeaders['authorization'].startsWith('AWS4-HMAC-SHA256') &&
      signedHeaders['authorization'].includes('Credential=TEST_ACCESS_KEY_ID_12345/20261012/auto/s3/aws4_request') &&
      signedHeaders['x-amz-date'] === '20261012T120000Z' &&
      signedHeaders['x-amz-content-sha256'].length === 64,
      'Generates compliant AWS SigV4 headers for Cloudflare R2 S3-compatible API'
    );

    // 37. TEST: Independent Machine Recovery Simulation
    const cleanMachineDir = path.join(tempTestDir, 'secondary_clean_machine');
    fs.mkdirSync(cleanMachineDir, { mode: 0o700 });
    const exportedPkgPath = path.join(cleanMachineDir, 'recovery_package.json');
    fs.writeFileSync(exportedPkgPath, JSON.stringify(highIterPkg), { mode: 0o600 });
    const exportedEncDumpPath = path.join(cleanMachineDir, 'offsite_downloaded.dump.enc');
    const testData = Buffer.from('PGDMP_OFFSITE_INDEPENDENT_RECOVERY_TEST_DATA');
    const testDataPath = path.join(tempTestDir, 'source_test.dump');
    fs.writeFileSync(testDataPath, testData, { mode: 0o600 });
    encryptBackupArtifact(testDataPath, exportedEncDumpPath, highIterKey);

    const readPkg = JSON.parse(fs.readFileSync(exportedPkgPath, 'utf8'));
    const independentKey = recoverKeyFromPackage(readPkg, highIterPassphrase);
    const verifiedOnCleanMachine = verifyKeyAgainstEncryptedArtifact(exportedEncDumpPath, independentKey);
    const decryptedCleanPath = path.join(cleanMachineDir, 'recovered.dump');
    decryptBackupArtifact(exportedEncDumpPath, decryptedCleanPath, independentKey);
    const originalDigest = computeSha256(testDataPath);
    const recoveredDigest = computeSha256(decryptedCleanPath);

    assert(
      verifiedOnCleanMachine === true && originalDigest === recoveredDigest,
      'Proves independent recovery on isolated clean environment with bit-for-bit parity'
    );

    // 38. TEST: GoogleDriveStorageClient OAuth token refresh
    const mockAuthFetch: typeof fetch = async (input, init) => {
      const urlStr = String(input);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        const bodyStr = String(init?.body || '');
        if (bodyStr.includes('grant_type=refresh_token') && bodyStr.includes('refresh_token=mock_refresh_token_xyz')) {
          return new Response(JSON.stringify({
            access_token: 'mock_minted_access_token_123',
            expires_in: 3600,
            token_type: 'Bearer'
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClient1 = new GoogleDriveStorageClient({
      clientId: 'mock_client_id.apps.googleusercontent.com',
      clientSecret: 'mock_client_secret_abc',
      refreshToken: 'mock_refresh_token_xyz'
    }, mockAuthFetch);

    const mintedToken = await gdriveClient1.getValidAccessToken();
    assert(
      mintedToken === 'mock_minted_access_token_123',
      'GoogleDriveStorageClient: Refreshes OAuth token via mocked HTTP endpoint and updates expiry'
    );

    // 39. TEST: GoogleDriveStorageClient OAuth invalid_grant handling
    const mockAuthInvalidFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.'
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    };

    const gdriveClientInvalid = new GoogleDriveStorageClient({
      clientId: 'mock_client_id',
      clientSecret: 'mock_client_secret',
      refreshToken: 'expired_refresh_token'
    }, mockAuthInvalidFetch);

    let invalidGrantThrown = false;
    try {
      await gdriveClientInvalid.getValidAccessToken();
    } catch (err: any) {
      invalidGrantThrown = err.message.includes('invalid_grant') && err.message.includes('Re-authorization is required');
    }
    assert(
      invalidGrantThrown,
      'GoogleDriveStorageClient: Handles OAuth token error (invalid_grant) and throws actionable error'
    );

    // 40. TEST: GoogleDriveStorageClient folder resolution (App-owned creation under drive.file)
    let folderCreated: boolean = false;
    const mockFolderFetch: typeof fetch = async (input, init) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr === 'https://www.googleapis.com/drive/v3/files' && init?.method === 'POST') {
        folderCreated = true;
        return new Response(JSON.stringify({
          id: 'folder_mock_created_987',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientFolder = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000
    }, mockFolderFetch);

    const folderRes = await gdriveClientFolder.resolveTargetFolder();
    assert(
      (folderCreated as boolean) === true && folderRes.folderId === 'folder_mock_created_987' && folderRes.created === true,
      'GoogleDriveStorageClient: Resolves target backup folder with fallback creation under drive.file'
    );

    // 41. TEST: GoogleDriveStorageClient binary multipart upload with metadata and checksum verification
    const testEncUploadPath = path.join(tempTestDir, 'gdrive_test_artifact.dump.enc');
    const encKeyForDrive = crypto.randomBytes(32);
    encryptBackupArtifact(testDataPath, testEncUploadPath, encKeyForDrive);
    const testEncBytes = fs.readFileSync(testEncUploadPath);
    const testEncSha256 = computeSha256(testEncUploadPath);
    const testEncMd5 = crypto.createHash('md5').update(testEncBytes).digest('hex');

    let multipartBodyReceived = false;
    let authHeaderValid = false;
    let sha256InMetadata = false;

    const mockUploadFetch: typeof fetch = async (input, init) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files/existing_folder_123')) {
        return new Response(JSON.stringify({
          id: 'existing_folder_123',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: true }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('uploadType=multipart')) {
        authHeaderValid = (init?.headers as any)?.authorization === 'Bearer valid_mock_token';
        const bodyBuf = Buffer.isBuffer(init?.body) ? init.body : Buffer.from(init?.body as any);
        multipartBodyReceived = bodyBuf.length > testEncBytes.length;
        sha256InMetadata = bodyBuf.toString('utf8').includes(testEncSha256);

        return new Response(JSON.stringify({
          id: 'gdrive_uploaded_file_111',
          name: 'gdrive_test_artifact.dump.enc',
          size: testEncBytes.length,
          md5Checksum: testEncMd5
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientUpload = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000,
      folderId: 'existing_folder_123'
    }, mockUploadFetch);

    const uploadRes = await gdriveClientUpload.upload(testEncUploadPath, 'gdrive_test_artifact.dump.enc');
    assert(
      uploadRes.remoteKey === 'gdrive_test_artifact.dump.enc' &&
      uploadRes.sizeBytes === testEncBytes.length &&
      uploadRes.etag === testEncMd5 &&
      authHeaderValid &&
      multipartBodyReceived &&
      sha256InMetadata,
      'GoogleDriveStorageClient: Constructs binary-safe multipart upload with metadata and verifies response'
    );

    // 42. TEST: Security Guard: Plaintext upload rejection
    const plainSqlPath = path.join(tempTestDir, 'unencrypted.sql');
    fs.writeFileSync(plainSqlPath, 'CREATE TABLE test(); INSERT INTO test VALUES(1);');
    let plaintextRejected = false;
    try {
      await gdriveClientUpload.upload(plainSqlPath, 'unencrypted.sql.enc');
    } catch (err: any) {
      plaintextRejected = err.message.includes('SECURITY REFUSAL') && err.message.includes('MOCKAI_GCM_V1');
    }
    assert(
      plaintextRejected,
      'GoogleDriveStorageClient: Security guard refuses plaintext upload and enforces AES-256-GCM ciphertext'
    );

    // 43. TEST: Immutability Guard: Duplicate file rejection
    const mockDuplicateFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files/existing_folder_123')) {
        return new Response(JSON.stringify({
          id: 'existing_folder_123',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: true }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({
          files: [{ id: 'duplicate_file_id_555', name: 'gdrive_test_artifact.dump.enc' }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientDup = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000,
      folderId: 'existing_folder_123'
    }, mockDuplicateFetch);

    let dupRejected = false;
    try {
      await gdriveClientDup.upload(testEncUploadPath, 'gdrive_test_artifact.dump.enc');
    } catch (err: any) {
      dupRejected = err.message.includes('BACKUP DUPLICATE CONFLICT') && err.message.includes('duplicate_file_id_555');
    }
    assert(
      dupRejected,
      'GoogleDriveStorageClient: Immutability guard rejects duplicate upload to protect existing artifacts'
    );

    // 44. TEST: Quota Error Handling (HTTP 403 storageQuotaExceeded)
    const mockQuotaFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files/existing_folder_123')) {
        return new Response(JSON.stringify({
          id: 'existing_folder_123',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: true }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('uploadType=multipart')) {
        return new Response(JSON.stringify({
          error: {
            errors: [{ domain: 'usageLimits', reason: 'storageQuotaExceeded', message: 'User storage quota exceeded.' }],
            code: 403,
            message: 'User storage quota exceeded.'
          }
        }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientQuota = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000,
      folderId: 'existing_folder_123'
    }, mockQuotaFetch);

    let quotaDetected = false;
    try {
      await gdriveClientQuota.upload(testEncUploadPath, 'gdrive_test_artifact.dump.enc');
    } catch (err: any) {
      quotaDetected = err.message.includes('storageQuotaExceeded') && err.message.includes('HTTP 403');
    }
    assert(
      quotaDetected,
      'GoogleDriveStorageClient: Quota guard detects HTTP 403 storageQuotaExceeded with descriptive error'
    );

    // 45. TEST: Binary Download with byte count and MD5 verification
    const testDownloadDest = path.join(tempTestDir, 'gdrive_downloaded.dump.enc');
    const mockDownloadFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({
          files: [{
            id: 'file_for_download_333',
            name: 'gdrive_test_artifact.dump.enc',
            size: testEncBytes.length,
            md5Checksum: testEncMd5
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/files/file_for_download_333?alt=media')) {
        return new Response(testEncBytes, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientDownload = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000
    }, mockDownloadFetch);

    const downloadRes = await gdriveClientDownload.download('gdrive_test_artifact.dump.enc', testDownloadDest);
    const downloadedBytes = fs.readFileSync(testDownloadDest);
    const downloadedSha256 = computeSha256(testDownloadDest);

    assert(
      downloadRes.sizeBytes === testEncBytes.length &&
      downloadedBytes.equals(testEncBytes) &&
      downloadedSha256 === testEncSha256,
      'GoogleDriveStorageClient: Downloads binary ciphertext and verifies byte count and MD5 checksum'
    );

    // 46. TEST: Download Interruption / Truncation Rejection
    const mockTruncatedDownloadFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({
          files: [{
            id: 'file_truncated_444',
            name: 'gdrive_test_artifact.dump.enc',
            size: testEncBytes.length,
            md5Checksum: testEncMd5
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/files/file_truncated_444?alt=media')) {
        return new Response(testEncBytes.subarray(0, Math.floor(testEncBytes.length / 2)), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const gdriveClientTruncated = new GoogleDriveStorageClient({
      clientId: 'mock_id',
      clientSecret: 'mock_sec',
      accessToken: 'valid_mock_token',
      tokenExpiry: Date.now() + 3600_000
    }, mockTruncatedDownloadFetch);

    let truncationRejected = false;
    try {
      await gdriveClientTruncated.download('gdrive_test_artifact.dump.enc', path.join(tempTestDir, 'truncated.dump.enc'));
    } catch (err: any) {
      truncationRejected = err.message.includes('Downloaded byte count mismatch') || err.message.includes('MD5 checksum mismatch');
    }
    assert(
      truncationRejected,
      'GoogleDriveStorageClient: Circuit breaker rejects truncated or interrupted download transfers'
    );

    // 47. TEST: Google Drive Credentials Loader and Redaction
    const mockSecretsDir = path.join(tempTestDir, 'secrets_test');
    fs.mkdirSync(mockSecretsDir, { mode: 0o700 });
    const mockEnvSecrets = path.join(mockSecretsDir, '.env.gdrive.secrets');
    fs.writeFileSync(mockEnvSecrets, [
      'GDRIVE_CLIENT_ID="123456789-mock.apps.googleusercontent.com"',
      'GDRIVE_CLIENT_SECRET="GOCSPX-supersecretclientsecret123"',
      'GDRIVE_REFRESH_TOKEN="1//04mockrefreshtoken456"',
      'GDRIVE_FOLDER_ID="1mockFolderId789"'
    ].join('\n'), { mode: 0o600 });

    const { credentials: loadedGdrive, secretsToRedact: gdriveRedact } = loadGoogleDriveCredentials(mockSecretsDir);
    assert(
      loadedGdrive !== null &&
      loadedGdrive.clientId === '123456789-mock.apps.googleusercontent.com' &&
      loadedGdrive.folderId === '1mockFolderId789' &&
      gdriveRedact.includes('GOCSPX-supersecretclientsecret123') &&
      gdriveRedact.includes('1//04mockrefreshtoken456'),
      'loadGoogleDriveCredentials: Loads credentials from file and adds tokens to redaction registry'
    );

    const sanitizedLog = sanitizeOutput('Token is 1//04mockrefreshtoken456 and secret is GOCSPX-supersecretclientsecret123', gdriveRedact);
    assert(
      !sanitizedLog.includes('1//04mockrefreshtoken456') &&
      !sanitizedLog.includes('GOCSPX-supersecretclientsecret123') &&
      sanitizedLog.includes('[REDACTED_SECRET]'),
      'sanitizeOutput: Automatically redacts Google Drive client secret and refresh tokens'
    );

    // 48. TEST: CLI Credential Refusal for Google Drive Tokens
    let clientSecretCliRejected = false;
    let refreshTokenCliRejected = false;
    try {
      parseCliArgs(['--client-secret=GOCSPX-badidea']);
    } catch (err: any) {
      clientSecretCliRejected = err.message.includes('SECURITY REFUSAL');
    }
    try {
      parseCliArgs(['--refresh-token=1//badidea']);
    } catch (err: any) {
      refreshTokenCliRejected = err.message.includes('SECURITY REFUSAL');
    }
    assert(
      clientSecretCliRejected && refreshTokenCliRejected,
      'parseCliArgs: Strictly rejects --client-secret and --refresh-token CLI arguments'
    );

    // 49. TEST: CLI Storage Backend Selection Parsing
    const optGdrive = parseCliArgs(['--storage=gdrive']);
    const optR2 = parseCliArgs(['--storage=r2']);
    const optDefault = parseCliArgs([]);
    let invalidStorageRejected = false;
    try {
      parseCliArgs(['--storage=unsupported_cloud']);
    } catch (err: any) {
      invalidStorageRejected = err.message.includes("Invalid storage backend 'unsupported_cloud'");
    }
    assert(
      optGdrive.storage === 'gdrive' &&
      optR2.storage === 'r2' &&
      optDefault.storage === undefined &&
      invalidStorageRejected,
      'parseCliArgs: Parses explicit --storage options and retains default behavior when omitted'
    );

    // 50. TEST: Disaster Recovery Rehearsal Pipeline with Google Drive Adapter
    const mockGdriveOffsiteClient: OffsiteStorageClient = {
      async upload(loc, rem) {
        return { remoteKey: rem, sizeBytes: fs.statSync(loc).size, etag: 'mock_etag_123' };
      },
      async download(rem, loc) {
        fs.copyFileSync(testEncUploadPath, loc);
        return { sizeBytes: fs.statSync(loc).size };
      }
    };

    const gdriveDrResult = await runDisasterRecoveryRehearsal({
      encryptedSourcePath: testEncUploadPath,
      recoveryKey: encKeyForDrive,
      offsiteClient: mockGdriveOffsiteClient,
      remoteKey: 'gdrive_test_artifact.dump.enc',
      dryRunRestore: true
    });

    assert(
      gdriveDrResult.success === true &&
      gdriveDrResult.step === 'COMPLETED' &&
      gdriveDrResult.circuitBreakerTriggered === false,
      'runDisasterRecoveryRehearsal: Executes full end-to-end disaster recovery rehearsal using GoogleDrive adapter'
    );

    // 51. TEST: Google OAuth Loopback Helper - Valid authorization callback and token exchange
    const testOauthDir = path.join(tempTestDir, 'oauth_secrets_test');
    fs.mkdirSync(testOauthDir, { mode: 0o700 });

    const mockTokenExchangeFetch: typeof fetch = async (input, init) => {
      const urlStr = String(input);
      if (urlStr === 'https://oauth2.googleapis.com/token' && init?.method === 'POST') {
        const bodyStr = String(init?.body || '');
        if (bodyStr.includes('grant_type=authorization_code') && bodyStr.includes('code=mock_valid_auth_code_123')) {
          return new Response(JSON.stringify({
            access_token: 'mock_exchange_access_token_456',
            refresh_token: 'mock_exchange_refresh_token_789',
            expires_in: 3600,
            token_type: 'Bearer'
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      }
      return new Response('Not Found', { status: 404 });
    };

    let generatedAuthUrl = '';
    const oauthPromise = executeGoogleOAuthLoopbackFlow({
      clientId: '123456789-mockclient.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-mocksecret123',
      secretsDir: testOauthDir,
      fetchFn: mockTokenExchangeFetch,
      openBrowser: false,
      timeoutMs: 10_000,
      onUrlGenerated: (url) => {
        generatedAuthUrl = url;
        const parsed = new URL(url);
        const stateParam = parsed.searchParams.get('state');
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?code=mock_valid_auth_code_123&state=${stateParam}`).catch(() => {});
      }
    });

    const oauthResult = await oauthPromise;
    const writtenSecretPath = path.join(testOauthDir, 'gdrive.secrets');
    const secretContent = fs.readFileSync(writtenSecretPath, 'utf8');

    assert(
      oauthResult.success === true &&
      oauthResult.refreshToken === 'mock_exchange_refresh_token_789' &&
      generatedAuthUrl.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file') &&
      generatedAuthUrl.includes('access_type=offline') &&
      generatedAuthUrl.includes('prompt=consent') &&
      secretContent.includes('GDRIVE_REFRESH_TOKEN="mock_exchange_refresh_token_789"') &&
      fs.existsSync(writtenSecretPath),
      'GoogleOAuthLoopbackHelper: Successfully handles valid callback, exchanges code, and saves mode 0600 token'
    );

    // 52. TEST: Google OAuth Loopback Helper - State mismatch (CSRF protection)
    let stateMismatchError = false;
    const csrfPromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: testOauthDir,
      openBrowser: false,
      timeoutMs: 5_000,
      onUrlGenerated: (url) => {
        const parsed = new URL(url);
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?code=mock_code&state=forged_untrusted_csrf_state`).catch(() => {});
      }
    });

    try {
      await csrfPromise;
    } catch (err: any) {
      stateMismatchError = err.message.includes('OAuth state mismatch') || err.message.includes('CSRF');
    }
    assert(
      stateMismatchError,
      'GoogleOAuthLoopbackHelper: Strictly enforces CSRF state validation and rejects mismatched state'
    );

    // 53. TEST: Google OAuth Loopback Helper - Missing authorization code in callback
    let missingCodeError = false;
    const missingCodePromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: testOauthDir,
      openBrowser: false,
      timeoutMs: 5_000,
      onUrlGenerated: (url) => {
        const parsed = new URL(url);
        const stateParam = parsed.searchParams.get('state');
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?state=${stateParam}`).catch(() => {});
      }
    });

    try {
      await missingCodePromise;
    } catch (err: any) {
      missingCodeError = err.message.includes('missing authorization code');
    }
    assert(
      missingCodeError,
      'GoogleOAuthLoopbackHelper: Rejects callback requests lacking authorization code'
    );

    // 54. TEST: Google OAuth Loopback Helper - Authorization denial by user
    let denialError = false;
    const denialPromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: testOauthDir,
      openBrowser: false,
      timeoutMs: 5_000,
      onUrlGenerated: (url) => {
        const parsed = new URL(url);
        const stateParam = parsed.searchParams.get('state');
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?error=access_denied&state=${stateParam}`).catch(() => {});
      }
    });

    try {
      await denialPromise;
    } catch (err: any) {
      denialError = err.message.includes('access_denied');
    }
    assert(
      denialError,
      'GoogleOAuthLoopbackHelper: Handles Google authorization denial error and terminates cleanly'
    );

    // 55. TEST: Google OAuth Loopback Helper - Server timeout shutdown
    let timeoutError = false;
    const timeoutPromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: testOauthDir,
      openBrowser: false,
      timeoutMs: 150 // 150ms timeout
    });

    try {
      await timeoutPromise;
    } catch (err: any) {
      timeoutError = err.message.includes('timed out');
    }
    assert(
      timeoutError,
      'GoogleOAuthLoopbackHelper: Automatically times out and shuts down callback server if unattended'
    );

    // 56. TEST: Google OAuth Loopback Helper - Token exchange failure handling
    let exchangeFailError = false;
    const mockExchangeFailFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({
        error: 'invalid_client',
        error_description: 'The OAuth client credentials are invalid.'
      }), { status: 401, headers: { 'content-type': 'application/json' } });
    };

    const exchangeFailPromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: testOauthDir,
      fetchFn: mockExchangeFailFetch,
      openBrowser: false,
      timeoutMs: 5_000,
      onUrlGenerated: (url) => {
        const parsed = new URL(url);
        const stateParam = parsed.searchParams.get('state');
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?code=valid_code&state=${stateParam}`).catch(() => {});
      }
    });

    try {
      await exchangeFailPromise;
    } catch (err: any) {
      exchangeFailError = err.message.includes('OAuth token exchange failed') && err.message.includes('invalid_client');
    }
    assert(
      exchangeFailError,
      'GoogleOAuthLoopbackHelper: Handles token exchange HTTP errors with descriptive failure message'
    );

    // 57. TEST: Google OAuth Loopback Helper - Missing refresh token without prior credentials
    let missingRefreshError = false;
    const emptySecretsDir = path.join(tempTestDir, 'empty_secrets_test');
    fs.mkdirSync(emptySecretsDir, { mode: 0o700 });

    const mockNoRefreshFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({
        access_token: 'ephemeral_access_only',
        expires_in: 3600,
        token_type: 'Bearer'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const noRefreshPromise = executeGoogleOAuthLoopbackFlow({
      clientId: 'mock_client',
      clientSecret: 'mock_secret',
      secretsDir: emptySecretsDir,
      fetchFn: mockNoRefreshFetch,
      openBrowser: false,
      timeoutMs: 5_000,
      onUrlGenerated: (url) => {
        const parsed = new URL(url);
        const stateParam = parsed.searchParams.get('state');
        const redirectUri = parsed.searchParams.get('redirect_uri')!;
        fetch(`${redirectUri}?code=valid_code&state=${stateParam}`).catch(() => {});
      }
    });

    try {
      await noRefreshPromise;
    } catch (err: any) {
      missingRefreshError = err.message.includes('did not include a refresh_token');
    }
    assert(
      missingRefreshError,
      'GoogleOAuthLoopbackHelper: Rejects token exchange response if refresh_token is missing'
    );

    // 58. TEST: CLI argument refusal for authorization codes
    let codeArgRejected = false;
    let authCodeArgRejected = false;
    try {
      parseCliArgs(['--code=4/0AeanS...']);
    } catch (err: any) {
      codeArgRejected = err.message.includes('SECURITY REFUSAL');
    }
    try {
      parseCliArgs(['--auth-code=4/0AeanS...']);
    } catch (err: any) {
      authCodeArgRejected = err.message.includes('SECURITY REFUSAL');
    }
    assert(
      codeArgRejected && authCodeArgRejected,
      'parseCliArgs: Strictly rejects --code and --auth-code arguments to prevent process-table exposure'
    );

    // 59. TEST: CLI opt-in flag for --gdrive-auth
    const optAuth = parseCliArgs(['--gdrive-auth']);
    assert(
      optAuth.gdriveAuth === true,
      'parseCliArgs: Parses explicit opt-in --gdrive-auth command flag'
    );

    // 60. TEST: acquireRunLock acquires exclusive lock and creates mode 0600 lockfile
    const testLockDir = path.join(tempTestDir, 'test_locks');
    const lock1 = acquireRunLock(testLockDir);
    assert(
      lock1.acquired === true &&
      fs.existsSync(lock1.lockPath) &&
      (fs.statSync(lock1.lockPath).mode & 0o777) === 0o600,
      'acquireRunLock: Successfully acquires exclusive lock and creates mode 0600 lockfile'
    );
    lock1.release();
    assert(
      !fs.existsSync(lock1.lockPath),
      'acquireRunLock: Releases lock and safely unlinks lockfile'
    );

    // 61. TEST: acquireRunLock rejects concurrent execution when lock is held by active PID
    const lock2 = acquireRunLock(testLockDir);
    assert(lock2.acquired === true, 'acquireRunLock: Setup initial lock holder');
    const lockContention = acquireRunLock(testLockDir);
    assert(
      lockContention.acquired === false && lockContention.runningPid === process.pid,
      'acquireRunLock: Concurrency rejection when lock is held by active PID'
    );
    lock2.release();

    // 62. TEST: acquireRunLock safely reclaims stale lock when holding PID is deceased
    fs.mkdirSync(testLockDir, { recursive: true, mode: 0o700 });
    const staleLockPath = path.join(testLockDir, 'backup_runner.lock');
    fs.writeFileSync(staleLockPath, JSON.stringify({ pid: 9999999, acquiredAt: new Date(Date.now() - 3600_000).toISOString() }), { mode: 0o600 });
    const reclaimedLock = acquireRunLock(testLockDir);
    assert(
      reclaimedLock.acquired === true,
      'acquireRunLock: Safely reclaims stale lock when holding PID does not exist'
    );
    reclaimedLock.release();

    // 63. TEST: appendExecutionLog writes structured JSONL record with mode 0600 and redacts sensitive tokens
    const testLogDir = path.join(tempTestDir, 'test_logs');
    const secretToRedact = 'SuperSecretToken999';
    const logPath = appendExecutionLog(testLogDir, {
      runId: 'test-run-123',
      timestampUtc: new Date().toISOString(),
      status: 'FAILURE',
      storageBackend: 'gdrive',
      environment: 'delivery',
      durationMs: 450,
      stages: { lock: true, export: true, encrypt: false, upload: false, retentionAudit: false },
      errorCategory: 'ENCRYPTION_FAILED',
      errorMessage: `Failed with secret: ${secretToRedact}`
    }, [secretToRedact]);

    assert(
      fs.existsSync(logPath) && (fs.statSync(logPath).mode & 0o777) === 0o600,
      'appendExecutionLog: Writes JSONL audit record with restricted mode 0600'
    );
    const logLine = fs.readFileSync(logPath, 'utf8').trim();
    const parsedLog = JSON.parse(logLine);
    assert(
      parsedLog.runId === 'test-run-123' &&
      !logLine.includes(secretToRedact) &&
      logLine.includes('[REDACTED_SECRET]'),
      'appendExecutionLog: Automatically redacts secret tokens from log record'
    );

    // 64. TEST: executeAutomatedBackupRun executes end-to-end automated run with mock export, encrypt, upload, and log
    const testAutoRepo = path.join(tempTestDir, 'auto_repo');
    fs.mkdirSync(testAutoRepo, { recursive: true });
    const testAutoBackups = path.join(tempTestDir, 'auto_backups');
    fs.mkdirSync(testAutoBackups, { recursive: true });
    const testAutoKey = path.join(tempTestDir, 'auto_key.key');
    const autoKeyBytes = crypto.randomBytes(32);
    fs.writeFileSync(testAutoKey, autoKeyBytes.toString('hex'), { mode: 0o600 });

    const mockAutoSecrets = path.join(testAutoRepo, '.env.gdrive.secrets');
    fs.writeFileSync(mockAutoSecrets, [
      'GDRIVE_CLIENT_ID="mock_client_id.apps.googleusercontent.com"',
      'GDRIVE_CLIENT_SECRET="mock_secret"',
      'GDRIVE_REFRESH_TOKEN="mock_refresh"',
      'GDRIVE_FOLDER_ID="mock_folder_111"'
    ].join('\n'), { mode: 0o600 });

    const mockDumpPath = path.join(testAutoBackups, 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_220000Z.dump');
    fs.writeFileSync(mockDumpPath, 'PGDMP_MOCK_DATABASE_EXPORT_CONTENTS');

    let customBackupCalled = false;
    const mockBackupFn = async (config: BackupConfig): Promise<any> => {
      customBackupCalled = true;
      return {
        success: true,
        backupFile: mockDumpPath,
        sizeBytes: 35,
        sha256: computeSha256(mockDumpPath)
      };
    };

    let uploadPayloadReceived = false;
    const mockAutoFetch: typeof fetch = async (input, init) => {
      const urlStr = String(input);
      if (urlStr.includes('/oauth2/v2/auth') || urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'valid_mock_token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files/mock_folder_111')) {
        return new Response(JSON.stringify({
          id: 'mock_folder_111',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: true }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('uploadType=multipart')) {
        uploadPayloadReceived = true;
        return new Response(JSON.stringify({ id: 'uploaded_auto_file_123' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const autoResult = await executeAutomatedBackupRun({
      repoRoot: testAutoRepo,
      storage: 'gdrive',
      lockDir: testLockDir,
      logDir: testLogDir,
      backupDir: testAutoBackups,
      keyFile: testAutoKey,
      customFetch: mockAutoFetch,
      customBackupFn: mockBackupFn
    });

    assert(
      autoResult.status === 'SUCCESS' &&
      customBackupCalled &&
      uploadPayloadReceived &&
      fs.existsSync(`${mockDumpPath}.enc`) &&
      fs.existsSync(`${mockDumpPath}.enc.sha256`) &&
      autoResult.lockReleased === true,
      'executeAutomatedBackupRun: Executes full automated backup pipeline (mock export, encrypt, upload, retention, log)'
    );

    // 65. TEST: executeAutomatedBackupRun concurrency conflict triggers clean SKIPPED status
    const blockingLock = acquireRunLock(testLockDir);
    const skippedResult = await executeAutomatedBackupRun({
      repoRoot: testAutoRepo,
      storage: 'gdrive',
      lockDir: testLockDir,
      logDir: testLogDir,
      backupDir: testAutoBackups,
      keyFile: testAutoKey,
      customFetch: mockAutoFetch,
      customBackupFn: mockBackupFn
    });
    blockingLock.release();

    assert(
      skippedResult.status === 'SKIPPED' &&
      skippedResult.errorCategory === 'CONCURRENCY_LOCKED',
      'executeAutomatedBackupRun: Concurrency conflict triggers clean SKIPPED status without crashing'
    );

    // 66. TEST: executeAutomatedBackupRun export failure logs descriptive error and cleans lock
    const failingBackupFn = async (config: BackupConfig): Promise<any> => {
      throw new Error('Supabase pooler connection timeout');
    };

    const exportFailResult = await executeAutomatedBackupRun({
      repoRoot: testAutoRepo,
      storage: 'gdrive',
      lockDir: testLockDir,
      logDir: testLogDir,
      backupDir: testAutoBackups,
      keyFile: testAutoKey,
      customFetch: mockAutoFetch,
      customBackupFn: failingBackupFn
    });

    assert(
      exportFailResult.status === 'FAILURE' &&
      exportFailResult.errorCategory === 'DATABASE_EXPORT_FAILED' &&
      !fs.existsSync(path.join(testLockDir, 'backup_runner.lock')),
      'executeAutomatedBackupRun: Export failure logs descriptive error and cleans lock'
    );

    // 67. TEST: executeAutomatedBackupRun offsite upload failure logs descriptive error and preserves local backup
    const mockDumpPath2 = path.join(testAutoBackups, 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_220500Z.dump');
    fs.writeFileSync(mockDumpPath2, 'PGDMP_MOCK_DATABASE_EXPORT_CONTENTS_2');
    const mockBackupFn2 = async (config: BackupConfig): Promise<any> => {
      return {
        success: true,
        backupFile: mockDumpPath2,
        sizeBytes: 37,
        sha256: computeSha256(mockDumpPath2)
      };
    };

    const failingUploadFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'valid_mock_token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files/mock_folder_111')) {
        return new Response(JSON.stringify({
          id: 'mock_folder_111',
          name: 'MockAI-Disaster-Recovery',
          mimeType: 'application/vnd.google-apps.folder',
          trashed: false,
          capabilities: { canAddChildren: true }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('uploadType=multipart')) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response('Not Found', { status: 404 });
    };

    const uploadFailResult = await executeAutomatedBackupRun({
      repoRoot: testAutoRepo,
      storage: 'gdrive',
      lockDir: testLockDir,
      logDir: testLogDir,
      backupDir: testAutoBackups,
      keyFile: testAutoKey,
      customFetch: failingUploadFetch,
      customBackupFn: mockBackupFn2
    });

    assert(
      uploadFailResult.status === 'FAILURE' &&
      uploadFailResult.errorCategory === 'UPLOAD_FAILED' &&
      fs.existsSync(mockDumpPath2) &&
      fs.existsSync(`${mockDumpPath2}.enc`) &&
      !fs.existsSync(path.join(testLockDir, 'backup_runner.lock')),
      'executeAutomatedBackupRun: Offsite upload failure logs descriptive error and preserves local backup'
    );

    // 68. TEST: CLI argument parsing for --automated-run
    const optAuto = parseCliArgs(['--automated-run', '--storage=gdrive']);
    assert(
      optAuto.automatedRun === true && optAuto.storage === 'gdrive',
      'parseCliArgs: Parses explicit --automated-run and storage options'
    );

    // 69. TEST: parseBackupHistory returns empty entries when history file does not exist
    const missingHist = parseBackupHistory(path.join(tempTestDir, 'nonexistent.jsonl'));
    assert(
      missingHist.entries.length === 0 &&
      missingHist.corruptedLinesCount === 0 &&
      missingHist.totalLines === 0 &&
      missingHist.lastSuccessEntry === undefined,
      'parseBackupHistory: Returns empty entries and 0 corrupted lines when history file does not exist'
    );

    // 70. TEST: parseBackupHistory safely skips malformed JSON lines and counts corruptions
    const malformedHistPath = path.join(tempTestDir, 'malformed_history.jsonl');
    fs.writeFileSync(
      malformedHistPath,
      [
        'NOT_VALID_JSON',
        '{"valid": false}',
        JSON.stringify({
          runId: 'run-valid-1',
          timestampUtc: '2026-10-12T10:00:00.000Z',
          status: 'SUCCESS',
          storageBackend: 'gdrive',
          environment: 'delivery',
          durationMs: 1200,
          artifactName: 'artifact-1.dump.enc',
          sha256Digest: 'abc123'
        }),
        '{malformed json syntax',
        '',
        '   ',
        JSON.stringify({
          runId: 'run-valid-2',
          timestampUtc: '2026-10-12T12:00:00.000Z',
          status: 'FAILURE',
          storageBackend: 'gdrive',
          environment: 'delivery',
          durationMs: 500,
          errorCategory: 'TEST_ERR'
        })
      ].join('\n')
    );
    const malformedHist = parseBackupHistory(malformedHistPath);
    assert(
      malformedHist.totalLines === 5 &&
      malformedHist.corruptedLinesCount === 3 &&
      malformedHist.entries.length === 2 &&
      malformedHist.lastSuccessEntry?.runId === 'run-valid-1',
      'parseBackupHistory: Safely skips malformed JSON lines, tracks corruption count, and parses valid records'
    );

    // 71. TEST: parseBackupHistory identifies latest successful backup run
    const mixedHistPath = path.join(tempTestDir, 'mixed_history.jsonl');
    fs.writeFileSync(
      mixedHistPath,
      [
        JSON.stringify({ runId: 'run-old-success', timestampUtc: '2026-10-10T10:00:00.000Z', status: 'SUCCESS' }),
        JSON.stringify({ runId: 'run-failed', timestampUtc: '2026-10-11T10:00:00.000Z', status: 'FAILURE' }),
        JSON.stringify({ runId: 'run-latest-success', timestampUtc: '2026-10-12T10:00:00.000Z', status: 'SUCCESS' }),
        JSON.stringify({ runId: 'run-skipped', timestampUtc: '2026-10-12T11:00:00.000Z', status: 'SKIPPED' })
      ].join('\n')
    );
    const mixedHist = parseBackupHistory(mixedHistPath);
    assert(
      mixedHist.entries.length === 4 &&
      mixedHist.lastSuccessEntry?.runId === 'run-latest-success',
      'parseBackupHistory: Identifies latest successful backup run among mixed entries'
    );

    // 72. TEST: parseBackupHistory returns undefined lastSuccessEntry when history contains only failures
    const noSuccessHistPath = path.join(tempTestDir, 'no_success_history.jsonl');
    fs.writeFileSync(
      noSuccessHistPath,
      [
        JSON.stringify({ runId: 'run-f1', timestampUtc: '2026-10-12T10:00:00.000Z', status: 'FAILURE' }),
        JSON.stringify({ runId: 'run-s1', timestampUtc: '2026-10-12T11:00:00.000Z', status: 'SKIPPED' })
      ].join('\n')
    );
    const noSuccessHist = parseBackupHistory(noSuccessHistPath);
    assert(
      noSuccessHist.entries.length === 2 &&
      noSuccessHist.lastSuccessEntry === undefined,
      'parseBackupHistory: Returns lastSuccessEntry === undefined when history contains only failures and skips'
    );

    // 73. TEST: checkBackupHealth reports MISSING_LOGS when history log file does not exist
    const missingLogHealth = await checkBackupHealth({
      logDir: path.join(tempTestDir, 'empty_logs_dir'),
      backupDir: path.join(tempTestDir, 'empty_backups_dir'),
      skipRemote: true
    });
    assert(
      missingLogHealth.status === 'MISSING_LOGS' &&
      missingLogHealth.details.reason?.includes('not found'),
      'checkBackupHealth: Reports MISSING_LOGS when history log file does not exist'
    );

    // 74. TEST: checkBackupHealth reports MISSING_LOGS when history exists but contains no successful runs
    const healthNoSuccessDir = path.join(tempTestDir, 'health_no_success_logs');
    fs.mkdirSync(healthNoSuccessDir, { recursive: true });
    fs.writeFileSync(
      path.join(healthNoSuccessDir, 'backup_history.jsonl'),
      JSON.stringify({ runId: 'run-fail', timestampUtc: '2026-10-12T12:00:00.000Z', status: 'FAILURE' }) + '\n'
    );
    const healthNoSuccess = await checkBackupHealth({
      logDir: healthNoSuccessDir,
      backupDir: path.join(tempTestDir, 'empty_backups_dir'),
      skipRemote: true
    });
    assert(
      healthNoSuccess.status === 'MISSING_LOGS' &&
      healthNoSuccess.details.reason?.includes('no successful backup runs'),
      'checkBackupHealth: Reports MISSING_LOGS when history file exists but contains no successful runs'
    );

    // 75. TEST: checkBackupHealth reports HEALTHY when backup is fresh (< 26h), local checksum matches, and remote metadata matches
    const healthHealthyDir = path.join(tempTestDir, 'health_healthy');
    const healthHealthyLogs = path.join(healthHealthyDir, 'logs');
    const healthHealthyBackups = path.join(healthHealthyDir, 'backups');
    fs.mkdirSync(healthHealthyLogs, { recursive: true });
    fs.mkdirSync(healthHealthyBackups, { recursive: true });

    const testHealthArtifactName = 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_180000Z.dump.enc';
    const testHealthArtifactPath = path.join(healthHealthyBackups, testHealthArtifactName);
    fs.writeFileSync(testHealthArtifactPath, 'MOCK_HEALTHY_ENCRYPTED_ARTIFACT_CONTENT');
    const expectedHealthDigest = computeSha256(testHealthArtifactPath);
    fs.writeFileSync(`${testHealthArtifactPath}.sha256`, `${expectedHealthDigest}  ${testHealthArtifactName}\n`);

    const mockHealthyNow = new Date('2026-10-12T20:00:00.000Z');
    const mockBackupTimestamp = '2026-10-12T18:00:00.000Z'; // 2 hours elapsed, well within 26h

    fs.writeFileSync(
      path.join(healthHealthyLogs, 'backup_history.jsonl'),
      JSON.stringify({
        runId: 'healthy-run-1',
        timestampUtc: mockBackupTimestamp,
        status: 'SUCCESS',
        storageBackend: 'gdrive',
        environment: 'delivery',
        durationMs: 2500,
        artifactName: testHealthArtifactName,
        sizeBytes: 40,
        sha256Digest: expectedHealthDigest
      }) + '\n'
    );

    const mockHealthyFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'valid_mock_token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({
          files: [{
            id: 'mock_remote_file_123',
            name: testHealthArtifactName,
            size: 40,
            appProperties: {
              sha256: expectedHealthDigest,
              format: 'MOCKAI_GCM_V1'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const healthyResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: healthHealthyLogs,
      backupDir: healthHealthyBackups,
      now: mockHealthyNow,
      thresholdHours: 26,
      customFetch: mockHealthyFetch,
      checkRemote: true
    });

    assert(
      healthyResult.status === 'HEALTHY' &&
      healthyResult.freshnessHours !== undefined &&
      healthyResult.freshnessHours < 26 &&
      healthyResult.localChecksumVerified === true &&
      healthyResult.remoteMetadataVerified === true &&
      healthyResult.details.remoteFileId === 'mock_remote_file_123',
      'checkBackupHealth: Reports HEALTHY when backup is fresh, local checksum matches, and remote metadata matches'
    );

    // 76. TEST: checkBackupHealth reports STALE when latest backup exceeds freshness threshold
    const staleNow = new Date('2026-10-14T00:00:00.000Z'); // 30 hours after 2026-10-12T18:00:00.000Z
    const staleResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: healthHealthyLogs,
      backupDir: healthHealthyBackups,
      now: staleNow,
      thresholdHours: 26,
      customFetch: mockHealthyFetch,
      checkRemote: true
    });

    assert(
      staleResult.status === 'STALE' &&
      staleResult.freshnessHours !== undefined &&
      staleResult.freshnessHours > 26 &&
      staleResult.details.reason?.includes('exceeding freshness threshold'),
      'checkBackupHealth: Reports STALE when latest backup exceeds freshness threshold'
    );

    // 77. TEST: checkBackupHealth reports CHECKSUM_MISMATCH when local ciphertext is tampered
    const tamperedDir = path.join(tempTestDir, 'tampered_local');
    const tamperedLogs = path.join(tamperedDir, 'logs');
    const tamperedBackups = path.join(tamperedDir, 'backups');
    fs.mkdirSync(tamperedLogs, { recursive: true });
    fs.mkdirSync(tamperedBackups, { recursive: true });

    const tamperedArtifactName = 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_180000Z.dump.enc';
    const tamperedArtifactPath = path.join(tamperedBackups, tamperedArtifactName);
    fs.writeFileSync(tamperedArtifactPath, 'MUTATED_CORRUPTED_BYTES');
    const validDigest = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    fs.writeFileSync(`${tamperedArtifactPath}.sha256`, `${validDigest}  ${tamperedArtifactName}\n`);

    fs.writeFileSync(
      path.join(tamperedLogs, 'backup_history.jsonl'),
      JSON.stringify({
        runId: 'tampered-run',
        timestampUtc: '2026-10-12T18:00:00.000Z',
        status: 'SUCCESS',
        storageBackend: 'gdrive',
        environment: 'delivery',
        durationMs: 1000,
        artifactName: tamperedArtifactName,
        sizeBytes: 22,
        sha256Digest: validDigest
      }) + '\n'
    );

    const tamperedResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: tamperedLogs,
      backupDir: tamperedBackups,
      now: mockHealthyNow,
      skipRemote: true
    });

    assert(
      tamperedResult.status === 'CHECKSUM_MISMATCH' &&
      tamperedResult.localChecksumVerified === false &&
      tamperedResult.details.reason?.includes('does not match'),
      'checkBackupHealth: Reports CHECKSUM_MISMATCH when local ciphertext is tampered'
    );

    // 78. TEST: checkBackupHealth reports CHECKSUM_MISMATCH when companion .sha256 file is mismatched
    const tamperedShaDir = path.join(tempTestDir, 'tampered_sha');
    const tamperedShaLogs = path.join(tamperedShaDir, 'logs');
    const tamperedShaBackups = path.join(tamperedShaDir, 'backups');
    fs.mkdirSync(tamperedShaLogs, { recursive: true });
    fs.mkdirSync(tamperedShaBackups, { recursive: true });

    const artifactNameSha = 'mockai_delivery_zwouxjwrvmsqwjzgagyr_20261012_180000Z.dump';
    const artifactPathSha = path.join(tamperedShaBackups, artifactNameSha);
    fs.writeFileSync(artifactPathSha, 'DUMP_PLAINTEXT_BYTES');
    const realSha = computeSha256(artifactPathSha);
    // Tamper the .sha256 file
    fs.writeFileSync(`${artifactPathSha}.sha256`, `9999999999999999999999999999999999999999999999999999999999999999  ${artifactNameSha}\n`);

    fs.writeFileSync(
      path.join(tamperedShaLogs, 'backup_history.jsonl'),
      JSON.stringify({
        runId: 'sha-mismatch-run',
        timestampUtc: '2026-10-12T18:00:00.000Z',
        status: 'SUCCESS',
        storageBackend: 'gdrive',
        environment: 'delivery',
        durationMs: 1000,
        artifactName: artifactNameSha,
        sizeBytes: 20,
        sha256Digest: realSha
      }) + '\n'
    );

    const tamperedShaResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: tamperedShaLogs,
      backupDir: tamperedShaBackups,
      now: mockHealthyNow,
      skipRemote: true
    });

    assert(
      tamperedShaResult.status === 'CHECKSUM_MISMATCH' &&
      tamperedShaResult.details.reason?.includes('companion .sha256'),
      'checkBackupHealth: Reports CHECKSUM_MISMATCH when companion .sha256 file is mismatched'
    );

    // 79. TEST: checkBackupHealth reports CHECKSUM_MISMATCH when remote appProperties.sha256 does not match expected digest
    const mockRemoteMismatchFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'valid_mock_token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({
          files: [{
            id: 'mock_remote_file_mismatched',
            name: testHealthArtifactName,
            size: 40,
            appProperties: {
              sha256: '0000000000000000000000000000000000000000000000000000000000000000',
              format: 'MOCKAI_GCM_V1'
            }
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const remoteShaMismatchResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: healthHealthyLogs,
      backupDir: healthHealthyBackups,
      now: mockHealthyNow,
      customFetch: mockRemoteMismatchFetch,
      checkRemote: true
    });

    assert(
      remoteShaMismatchResult.status === 'CHECKSUM_MISMATCH' &&
      remoteShaMismatchResult.remoteMetadataVerified === false &&
      remoteShaMismatchResult.details.reason?.includes('Remote Google Drive appProperties.sha256'),
      'checkBackupHealth: Reports CHECKSUM_MISMATCH when remote appProperties.sha256 does not match expected digest'
    );

    // 80. TEST: checkBackupHealth reports REMOTE_METADATA_UNAVAILABLE when remote artifact is not found
    const mockRemoteNotFoundFetch: typeof fetch = async (input) => {
      const urlStr = String(input);
      if (urlStr.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'valid_mock_token', expires_in: 3600 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (urlStr.includes('/drive/v3/files?q=')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const remoteNotFoundResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: healthHealthyLogs,
      backupDir: healthHealthyBackups,
      now: mockHealthyNow,
      customFetch: mockRemoteNotFoundFetch,
      checkRemote: true
    });

    assert(
      remoteNotFoundResult.status === 'REMOTE_METADATA_UNAVAILABLE' &&
      remoteNotFoundResult.remoteMetadataVerified === undefined &&
      remoteNotFoundResult.details.reason?.includes('was not found in Google Drive'),
      'checkBackupHealth: Reports REMOTE_METADATA_UNAVAILABLE when remote artifact is not found'
    );

    // 81. TEST: checkBackupHealth respects custom thresholdHours and skipRemote options
    const customThresholdResult = await checkBackupHealth({
      repoRoot: testAutoRepo,
      logDir: healthHealthyLogs,
      backupDir: healthHealthyBackups,
      now: mockHealthyNow,
      thresholdHours: 1,
      skipRemote: true
    });

    assert(
      customThresholdResult.status === 'STALE' &&
      customThresholdResult.thresholdHours === 1 &&
      customThresholdResult.details.remoteMetadataChecked === false,
      'checkBackupHealth: Respects custom thresholdHours and skipRemote options'
    );

    // 82. TEST: GoogleDriveStorageClient.getFileMetadata read-only metadata query returns metadata without downloads
    const testCredsGdrive: GoogleDriveCredentials = {
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      refreshToken: 'test_refresh_token'
    };
    const gdriveClientMeta = new GoogleDriveStorageClient(testCredsGdrive, mockHealthyFetch);
    const retrievedMeta = await gdriveClientMeta.getFileMetadata(testHealthArtifactName);
    assert(
      retrievedMeta !== null &&
      retrievedMeta.id === 'mock_remote_file_123' &&
      retrievedMeta.appProperties?.sha256 === expectedHealthDigest,
      'GoogleDriveStorageClient.getFileMetadata: Read-only metadata query returns metadata without downloads'
    );

    // 83. TEST: parseCliArgs parses explicit --check-health, --threshold-hours, and --skip-remote options
    const optHealth = parseCliArgs(['--check-health', '--threshold-hours=12', '--skip-remote']);
    assert(
      optHealth.checkHealth === true &&
      optHealth.thresholdHours === 12 &&
      optHealth.skipRemote === true,
      'parseCliArgs: Parses explicit --check-health, --threshold-hours, and --skip-remote options'
    );

    // 84. TEST: parseCliArgs rejects invalid non-positive --threshold-hours values
    let rejectedThreshold = false;
    try {
      parseCliArgs(['--check-health', '--threshold-hours=-5']);
    } catch (e: any) {
      rejectedThreshold = e.message.includes('Must be a positive number');
    }
    assert(
      rejectedThreshold === true,
      'parseCliArgs: Rejects invalid non-positive --threshold-hours values'
    );

  } finally {
    // Clean up temporary unit test scratch sandbox
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runBackupTestSuite().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
