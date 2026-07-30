import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const helper = read('supabase/functions/_shared/workerAuth.ts');
const config = read('supabase/config.toml');
const deleteWorker = read(
  'supabase/functions/delete-scheduled-accounts/index.ts'
);
const processWorker = read(
  'supabase/functions/process-scheduled-transactions/index.ts'
);
const sendWorker = read('supabase/functions/send-z-report/index.ts');
const notifyWorker = read(
  'supabase/functions/notify-linked-users/index.ts'
);

function configSection(functionName: string): string {
  const marker = `[functions.${functionName}]`;
  const start = config.indexOf(marker);
  if (start < 0) throw new Error(`${marker} bulunamadı`);

  const nextSection = config.indexOf('\n[', start + marker.length);
  return config.slice(start, nextSection < 0 ? undefined : nextSection);
}

describe('P0-S5 privileged Edge Function authorization contract', () => {
  it('shared guard is POST-only and accepts only same-project service-role credentials', () => {
    expect(helper).toContain('req.method === "POST"');
    expect(helper).toContain('return match?.[1] ?? null;');
    expect(helper).toContain('timingSafeEqual(token, serviceRoleKey)');
    expect(helper).toContain('payload?.role === "service_role"');
    expect(helper).toContain('payload?.ref === expectedProjectRef');
    expect(helper).toContain('payload?.iss === "supabase"');
    expect(helper).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(helper).toContain('Deno.env.get("SUPABASE_URL")');
    expect(helper).toContain('status,\n    headers:');
    expect(helper).toContain('405,');
    expect(helper).toContain('{ Allow: "OPTIONS, POST" }');
    expect(helper).toContain('401,');
    expect(helper).not.toContain('.includes(serviceRoleKey)');
  });

  it.each([
    ['delete-scheduled-accounts', deleteWorker],
    ['process-scheduled-transactions', processWorker],
    ['send-z-report', sendWorker],
  ])(
    '%s runs the worker guard before privileged client/body work',
    (_name, source) => {
      const options = source.indexOf('req.method === "OPTIONS"');
      const guard = source.indexOf(
        'guardServiceRoleWorkerRequest(req, corsHeaders)'
      );
      const adminClient = source.indexOf('const supabaseAdmin = createClient(');
      const bodyParse = source.indexOf('await req.json()');

      expect(options).toBeGreaterThan(-1);
      expect(guard).toBeGreaterThan(options);
      expect(adminClient).toBeGreaterThan(guard);
      if (bodyParse >= 0) expect(bodyParse).toBeGreaterThan(guard);
      expect(source).toContain('withFnTelemetry({');
      expect(source).toContain(`name: "${_name}"`);
      if (_name !== 'send-z-report') {
        expect(source).toContain('largePayloadProne: true');
      }
    }
  );

  it('config explicitly keeps platform JWT verification on for cron workers', () => {
    for (const functionName of [
      'delete-scheduled-accounts',
      'process-scheduled-transactions',
      'send-z-report',
      'notify-linked-users',
    ]) {
      expect(configSection(functionName)).toMatch(
        /^verify_jwt = true$/m
      );
    }
  });
});

describe('notify-linked-users canonical worker contract', () => {
  it('runs privileged work only for an accepted service-role worker request', () => {
    expect(notifyWorker).toContain(
      'if (!isServiceRoleBearer(req, serviceRoleKey))'
    );
    expect(notifyWorker).toContain('return notifyResponse(true, 0);');
    expect(notifyWorker).not.toContain('supabaseAdmin.auth.getUser');
    expect(notifyWorker).not.toContain('callerUserId');

    const legacyNoop = notifyWorker.indexOf(
      'if (!isServiceRoleBearer(req, serviceRoleKey))'
    );
    const bodyParse = notifyWorker.indexOf('await req.json()');
    const adminClient = notifyWorker.indexOf(
      'const supabaseAdmin = createClient('
    );
    expect(legacyNoop).toBeGreaterThan(-1);
    expect(bodyParse).toBeGreaterThan(legacyNoop);
    expect(adminClient).toBeGreaterThan(legacyNoop);
  });

  it('takes only record.id from the request and loads financial fields canonically', () => {
    expect(notifyWorker).toContain('"record" in payload');
    expect(notifyWorker).toContain('"id" in payload.record');
    expect(notifyWorker).toContain('.schema("public")');
    expect(notifyWorker).toContain('.from("islemler")');
    expect(notifyWorker).toContain(
      '"id, cari_id, type, amount, description, isletme_id, source_currency"'
    );
    expect(notifyWorker).not.toMatch(/payload\.record\.(?:cari_id|type|amount|description|source_currency|isletme_id)/);
  });

  it('requires a linked cari and a canonical owner/viewer endpoint', () => {
    expect(notifyWorker).toContain('if (!record.cari_id)');
    expect(notifyWorker).toContain('.from("cari_links")');
    expect(notifyWorker).toContain(
      'record.isletme_id === link.owner_isletme_id'
    );
    expect(notifyWorker).toContain(
      'record.isletme_id === link.viewer_isletme_id'
    );
    expect(notifyWorker).toContain(
      'if (links.length === 0) return notifyResponse(false, 0, 403);'
    );
  });

  it('returns only success/sent and never exposes recipients or push-provider results', () => {
    expect(notifyWorker).toContain(
      'JSON.stringify({ success, sent })'
    );
    expect(notifyWorker).toContain('return notifyResponse(true, sentCount);');
    expect(notifyWorker).not.toContain('total_links:');
    expect(notifyWorker).not.toContain('recipient_user:');
    expect(notifyWorker).not.toContain('recipient_isletme:');
    expect(notifyWorker).not.toContain('results,');
  });

  it('preserves OPTIONS, rejects other methods, and keeps telemetry wrapping', () => {
    expect(notifyWorker).toContain('req.method === "OPTIONS"');
    expect(notifyWorker).toContain(
      'guardPostRequest(req, corsHeaders, notifyFailureBody)'
    );
    expect(notifyWorker).toContain(
      'name: "notify-linked-users"'
    );
    expect(notifyWorker).toContain('largePayloadProne: true');
  });
});
