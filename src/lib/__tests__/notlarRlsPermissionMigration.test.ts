import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_PATH =
  'supabase/migrations/20260729112129_harden_notlar_rls_actions_context.sql';
const PB_PATH =
  'supabase/migrations/20260729064915_pb_internal_yetki_altyapisi.sql';

const migration = fs.readFileSync(
  path.join(ROOT, MIGRATION_PATH),
  'utf8',
);
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

function between(start: string, end: string): string {
  const startIndex = executableSql.indexOf(start);
  const endIndex = executableSql.indexOf(end, startIndex + start.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`SQL block not found: ${start} -> ${end}`);
  }

  return executableSql.slice(startIndex, endIndex);
}

const selectPolicy = between(
  'ALTER POLICY "Shared select notlar"',
  'ALTER POLICY "Shared insert notlar"',
);
const insertPolicy = between(
  'ALTER POLICY "Shared insert notlar"',
  'ALTER POLICY "Shared update notlar"',
);
const updatePolicy = between(
  'ALTER POLICY "Shared update notlar"',
  'ALTER POLICY "Shared delete notlar"',
);
const updateWithCheckIndex = updatePolicy.indexOf('WITH CHECK (');
const updateUsingPolicy = updatePolicy.slice(
  0,
  updateWithCheckIndex,
);
const updateWithCheckPolicy = updatePolicy.slice(
  updateWithCheckIndex,
);
const deletePolicy = between(
  'ALTER POLICY "Shared delete notlar"',
  'CREATE FUNCTION public.enforce_not_photo_attach_delta_v1()',
);
const photoDeltaTrigger = between(
  'CREATE FUNCTION public.enforce_not_photo_attach_delta_v1()',
  'CREATE POLICY "Shared attach own not photo"',
);
const photoAttachPolicy = between(
  'CREATE POLICY "Shared attach own not photo"',
  'CREATE FUNCTION public.not_guncelle_v1(',
);
const noteUpdateRpc = between(
  'CREATE FUNCTION public.not_guncelle_v1(',
  'REVOKE ALL ON TABLE public.notlar',
);

const actionPolicies = [insertPolicy, updatePolicy, deletePolicy];
const allEffectivePolicies = [
  selectPolicy,
  insertPolicy,
  updatePolicy,
  deletePolicy,
];

describe('P0-S9 notlar RLS permission migration', () => {
  it('P-B kanonik resolverindan sonra siralanir', () => {
    expect(MIGRATION_PATH.localeCompare(PB_PATH)).toBeGreaterThan(0);
    expect(executableSql).toContain(
      "internal.etkin_yetki(\n          notlar.isletme_id,",
    );
    expect(executableSql).not.toMatch(
      /permissions\s*(?:->|#>|#>>)/,
    );
    expect(allEffectivePolicies.join('\n')).not.toContain(
      'public.isletme_users',
    );
  });

  it('canli tablo, kolon, constraint, policy, ACL ve resolver driftini kilitler', () => {
    for (const fingerprint of [
      'fe58825fbd779e6db8f1495e00fa04be',
      '4af65ae3291e5ab8f9fe845a4bb8bf67',
      'b18f54ff8dabc0d3dc4e2b59b2a952be',
      'f8aebb82851b89301f6679f92a217e96',
    ]) {
      expect(executableSql).toContain(fingerprint);
    }

    expect(executableSql).toContain(
      "'{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'",
    );
    expect(executableSql).toContain(
      "'{postgres=X/postgres,authenticated=X/postgres}'",
    );
    expect(executableSql).toContain(
      'v_trigger_count IS DISTINCT FROM 0',
    );
  });

  it('permissive owner ALL politikasini false yapip resolver politikalarinin baypasini kapatir', () => {
    expect(executableSql).toMatch(
      /ALTER POLICY "Users can manage notlar"\s+ON public\.notlar\s+TO authenticated\s+USING \(false\)\s+WITH CHECK \(false\);/s,
    );
  });

  it('SELECTte baglamsal entity tiplerini exact kaynak moduluyle acar', () => {
    const mappings = [
      ["WHEN 'hesap'", "'hesaplar'"],
      ["WHEN 'cari'", "'cariler'"],
      ["WHEN 'personel'", "'personel'"],
      ["WHEN 'personel_izin'", "'personel'"],
      ["WHEN 'urun'", "'urunler'"],
    ] as const;

    for (const [entityType, moduleName] of mappings) {
      const entityIndex = selectPolicy.indexOf(entityType);
      const nextEntityIndex = selectPolicy.indexOf(
        'WHEN ',
        entityIndex + entityType.length,
      );
      const branch = selectPolicy.slice(
        entityIndex,
        nextEntityIndex < 0 ? undefined : nextEntityIndex,
      );

      expect(entityIndex).toBeGreaterThan(-1);
      expect(branch).toContain(moduleName);
      expect(branch).toContain('can_view IS TRUE');
    }
  });

  it('K5: atamasiz genel notu Notlar, atanmis genel notu hedef modul kesişimleriyle acar', () => {
    const generalBranchStart = selectPolicy.indexOf(
      "WHEN 'genel'",
    );
    const generalBranchEnd = selectPolicy.indexOf(
      "WHEN 'hesap'",
      generalBranchStart,
    );
    const generalBranch = selectPolicy.slice(
      generalBranchStart,
      generalBranchEnd,
    );

    expect(generalBranch).toMatch(
      /notlar\.assigned_to_cari IS NOT NULL\s+OR notlar\.assigned_to_personel IS NOT NULL\s+OR EXISTS \([\s\S]*?'notlar'[\s\S]*?note_permission\.can_view IS TRUE/s,
    );
    expect(selectPolicy).toMatch(
      /notlar\.assigned_to_cari IS NULL\s+OR EXISTS \([\s\S]*?'cariler'[\s\S]*?assigned_cari_permission\.can_view IS TRUE/s,
    );
    expect(selectPolicy).toMatch(
      /notlar\.assigned_to_personel IS NULL\s+OR EXISTS \([\s\S]*?'personel'[\s\S]*?assigned_employee_permission\.can_view IS TRUE/s,
    );
  });

  it('K5-M: yazma her zaman exact Notlar aksiyonu ve varsa tum baglam modullerini ister', () => {
    for (const policy of actionPolicies) {
      expect(policy).toContain("WHEN 'genel' THEN true");
      expect(policy).toContain(
        "internal.etkin_yetki(\n      notlar.isletme_id,\n      'notlar'",
      );
      expect(policy).toMatch(
        /notlar\.assigned_to_cari IS NULL\s+OR EXISTS \([\s\S]*?'cariler'[\s\S]*?assigned_cari_permission\.can_view IS TRUE/s,
      );
      expect(policy).toMatch(
        /notlar\.assigned_to_personel IS NULL\s+OR EXISTS \([\s\S]*?'personel'[\s\S]*?assigned_employee_permission\.can_view IS TRUE/s,
      );
    }
  });

  it('tum policylerde cari ve personel atamalarini AND kesişimiyle gate eder', () => {
    for (const policy of allEffectivePolicies) {
      expect(policy).toMatch(
        /notlar\.assigned_to_cari IS NULL\s+OR EXISTS \([\s\S]*?'cariler'[\s\S]*?assigned_cari_permission\.can_view IS TRUE/s,
      );
      expect(policy).toMatch(
        /notlar\.assigned_to_personel IS NULL\s+OR EXISTS \([\s\S]*?'personel'[\s\S]*?assigned_employee_permission\.can_view IS TRUE/s,
      );
    }
  });

  it('assigned_to_useri yetki vermeden okuma/mevcut-satir hedef kitlesi olarak daraltir', () => {
    expect(selectPolicy).toMatch(
      /notlar\.assigned_to_user IS NULL\s+OR notlar\.assigned_to_user = auth\.uid\(\)/s,
    );
    expect(insertPolicy).not.toContain(
      'assigned_to_user = auth.uid()',
    );
    expect(updateWithCheckPolicy).not.toContain(
      'assigned_to_user = auth.uid()',
    );
  });

  it('SELECTte global gorunurluk veya created_by own kuralini uygular', () => {
    expect(selectPolicy).toMatch(
      /visibility_permission\.can_see_all_users_data IS TRUE\s+OR notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(selectPolicy).not.toMatch(
      /created_by\s+IS\s+NULL/i,
    );
  });

  it('INSERTte exact can_create, hedef kesişimi ve server-owned created_by ister', () => {
    expect(insertPolicy).toContain(
      'action_permission.can_create IS TRUE',
    );
    expect(insertPolicy).toContain(
      'notlar.created_by = auth.uid()',
    );
    expect(insertPolicy).toMatch(
      /ON public\.notlar\s+TO authenticated\s+WITH CHECK \(/s,
    );
    expect(insertPolicy).not.toContain('USING (');
  });

  it('UPDATEte eski ve yeni satira USING + WITH CHECK exact own/all uygular', () => {
    expect(updatePolicy).toMatch(
      /TO authenticated\s+USING \([\s\S]*?\)\s+WITH CHECK \(/s,
    );
    expect(
      updatePolicy.match(
        /action_permission\.can_update_all IS TRUE/g,
      ),
    ).toHaveLength(2);
    expect(
      updatePolicy.match(
        /action_permission\.can_update_own IS TRUE\s+AND notlar\.created_by = auth\.uid\(\)/g,
      ),
    ).toHaveLength(2);
  });

  it('UPDATE mevcut satirda global/own ve assigned target sinirini edit_allda da korur', () => {
    expect(updateUsingPolicy).toMatch(
      /action_permission\.can_update_all IS TRUE[\s\S]*?visibility_permission\.can_see_all_users_data IS TRUE\s+OR notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(updateUsingPolicy).toMatch(
      /notlar\.assigned_to_user IS NULL\s+OR notlar\.assigned_to_user = auth\.uid\(\)/s,
    );

    // Owner resolverdan all/visibility=true alsa da hedef-kitle kapisi
    // resolverin disinda kalir; baskasina atanmis satiri owner da yazamaz.
    expect(
      updateUsingPolicy.indexOf(
        'notlar.assigned_to_user IS NULL',
      ),
    ).toBeGreaterThan(
      updateUsingPolicy.indexOf(
        ') AS visibility_permission',
      ),
    );
  });

  it('UPDATE WITH CHECK yeni notu baskasina atamaya izin verecek sekilde target-only kalir', () => {
    expect(updateWithCheckPolicy).not.toContain(
      'notlar.assigned_to_user',
    );
    expect(updateWithCheckPolicy).not.toContain(
      'can_see_all_users_data',
    );
    expect(updateWithCheckPolicy).toContain(
      'action_permission.can_update_all IS TRUE',
    );
  });

  it('DELETEte exact own/all ve hedef kesişimini uygular', () => {
    expect(deletePolicy).toContain(
      'action_permission.can_delete_all IS TRUE',
    );
    expect(deletePolicy).toMatch(
      /action_permission\.can_delete_own IS TRUE\s+AND notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(deletePolicy).toMatch(
      /ON public\.notlar\s+TO authenticated\s+USING \(/s,
    );
    expect(deletePolicy).not.toContain('WITH CHECK (');
  });

  it('DELETE edit_all olsa da gorunmeyen veya baskasina atanmis satiri hedefleyemez', () => {
    expect(deletePolicy).toMatch(
      /action_permission\.can_delete_all IS TRUE[\s\S]*?visibility_permission\.can_see_all_users_data IS TRUE\s+OR notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(deletePolicy).toMatch(
      /notlar\.assigned_to_user IS NULL\s+OR notlar\.assigned_to_user = auth\.uid\(\)/s,
    );
  });

  it('eski add-only clientin ilk fotograf UPDATEini own + NULL path ile daraltir', () => {
    expect(photoAttachPolicy).toMatch(
      /FOR UPDATE\s+TO authenticated\s+USING \(/s,
    );
    expect(photoAttachPolicy).toContain(
      'notlar.created_by = auth.uid()',
    );
    expect(photoAttachPolicy).toContain(
      'notlar.photo_path IS NULL',
    );
    expect(photoAttachPolicy).toContain(
      'action_permission.can_create IS TRUE',
    );
    expect(photoAttachPolicy).toContain(
      "'_[0-9]{10,20}[.]webp$'",
    );
    expect(photoAttachPolicy).toMatch(
      /notlar\.assigned_to_user IS NULL\s+OR notlar\.assigned_to_user = auth\.uid\(\)/s,
    );
    expect(photoAttachPolicy).toContain("'hesaplar'");
    expect(photoAttachPolicy).toContain("'cariler'");
    expect(photoAttachPolicy).toContain("'personel'");
    expect(photoAttachPolicy).toContain("'urunler'");
  });

  it('ek permissive policyyi delta trigger ile photo_path + updated_at disina kapatir', () => {
    expect(photoDeltaTrigger).toMatch(
      /CREATE FUNCTION public\.enforce_not_photo_attach_delta_v1\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path TO 'pg_catalog'/s,
    );
    expect(photoDeltaTrigger).toMatch(
      /IF COALESCE\(v_has_normal_update, false\) THEN\s+RETURN NEW;/s,
    );
    expect(photoDeltaTrigger).toContain(
      'OLD.created_by IS DISTINCT FROM v_user_id',
    );
    expect(photoDeltaTrigger).toContain(
      'OLD.photo_path IS NOT NULL',
    );
    expect(photoDeltaTrigger).toContain(
      'NEW.photo_path IS NULL',
    );
    expect(photoDeltaTrigger).toContain(
      "'_[0-9]{10,20}[.]webp$'",
    );
    expect(photoDeltaTrigger).toContain(
      "RAISE EXCEPTION 'NOT_PHOTO_ATTACH_NOT_AUTHORIZED'",
    );

    for (const forbiddenDelta of [
      'id',
      'isletme_id',
      'entity_type',
      'entity_id',
      'content',
      'is_completed',
      'completed_at',
      'reminder_date',
      'assigned_to_user',
      'assigned_to_cari',
      'assigned_to_personel',
      'created_at',
      'created_by',
    ]) {
      expect(photoDeltaTrigger).toContain(
        `NEW.${forbiddenDelta} IS DISTINCT FROM OLD.${forbiddenDelta}`,
      );
    }
    expect(photoDeltaTrigger).not.toContain(
      'NEW.updated_at IS DISTINCT FROM OLD.updated_at',
    );
    expect(executableSql).toMatch(
      /CREATE TRIGGER trg_notlar_enforce_photo_attach_delta_v1\s+BEFORE UPDATE ON public\.notlar\s+FOR EACH ROW/s,
    );
  });

  it('legacy fotograf UPDATEini policy+delta ile korur; yeni SECDEF attach yuzeyi acmaz', () => {
    expect(executableSql).not.toContain('attach_not_photo_v1');
    expect(photoAttachPolicy).toContain(
      'notlar.created_by = auth.uid()',
    );
    expect(photoAttachPolicy).toMatch(
      /notlar\.assigned_to_user IS NULL\s+OR notlar\.assigned_to_user = auth\.uid\(\)/s,
    );
    expect(photoDeltaTrigger).toContain(
      'OLD.created_by IS DISTINCT FROM v_user_id',
    );
  });

  it('assigned-away guncellemeyi SELECT RLSye takilmayan tam patch RPCsine alir', () => {
    expect(noteUpdateRpc).toMatch(
      /CREATE FUNCTION public\.not_guncelle_v1\([\s\S]*?\)\s+RETURNS uuid\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/s,
    );
    expect(noteUpdateRpc).toContain('FOR UPDATE;');
    expect(noteUpdateRpc).toContain(
      'v_permission.can_update_all IS TRUE',
    );
    expect(noteUpdateRpc).toContain(
      'v_permission.can_update_own IS TRUE',
    );
    expect(noteUpdateRpc).toContain(
      'v_permission.can_see_all_users_data IS TRUE',
    );
    expect(noteUpdateRpc).toMatch(
      /v_note\.assigned_to_user IS NULL\s+OR v_note\.assigned_to_user = v_user_id/s,
    );
    expect(noteUpdateRpc).toMatch(
      /member_row\.isletme_id = p_isletme_id[\s\S]*?member_row\.user_id = v_assigned_to_user[\s\S]*?member_row\.status = 'active'/s,
    );
    expect(noteUpdateRpc).toMatch(
      /UPDATE public\.notlar AS note_row[\s\S]*?RETURNING note_row\.id INTO v_updated_id;/s,
    );
    expect(noteUpdateRpc).toContain(
      'REVOKE ALL ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)',
    );
    expect(noteUpdateRpc).toContain(
      'GRANT EXECUTE ON FUNCTION public.not_guncelle_v1(uuid, uuid, jsonb)',
    );
  });

  it('tam update JSON patchini mutable allowlist ve photo object varligiyla kilitler', () => {
    for (const allowedKey of [
      'content',
      'is_completed',
      'completed_at',
      'reminder_date',
      'photo_path',
      'assigned_to_user',
      'assigned_to_cari',
      'assigned_to_personel',
    ]) {
      expect(noteUpdateRpc).toContain(`'${allowedKey}'`);
    }
    for (const forbiddenKey of [
      'id',
      'isletme_id',
      'entity_type',
      'entity_id',
      'created_at',
      'created_by',
      'updated_at',
    ]) {
      const allowlist = noteUpdateRpc.slice(
        noteUpdateRpc.indexOf('pg_catalog.jsonb_object_keys'),
        noteUpdateRpc.indexOf("RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'"),
      );
      expect(allowlist).not.toContain(`'${forbiddenKey}'`);
    }
    expect(noteUpdateRpc).toMatch(
      /v_photo_path IS DISTINCT FROM v_note\.photo_path[\s\S]*?FROM storage\.objects AS object_row[\s\S]*?object_row\.bucket_id = 'islem-photos'[\s\S]*?object_row\.name = v_photo_path/s,
    );
    expect(noteUpdateRpc).toMatch(
      /jsonb_typeof\(p_patch -> 'content'\)[\s\S]*?IS DISTINCT FROM 'string'/s,
    );
    expect(noteUpdateRpc).toMatch(
      /jsonb_typeof\(p_patch -> 'is_completed'\)[\s\S]*?IS DISTINCT FROM 'boolean'/s,
    );
    for (const nullableStringKey of [
      'completed_at',
      'reminder_date',
      'photo_path',
      'assigned_to_user',
      'assigned_to_cari',
      'assigned_to_personel',
    ]) {
      expect(noteUpdateRpc).toMatch(
        new RegExp(
          `jsonb_typeof\\(p_patch -> '${nullableStringKey}'\\)[\\s\\S]*?NOT IN \\('string', 'null'\\)`,
          's',
        ),
      );
    }
    expect(noteUpdateRpc).toMatch(
      /EXCEPTION\s+WHEN invalid_text_representation\s+OR invalid_datetime_format\s+OR datetime_field_overflow\s+THEN\s+RAISE EXCEPTION 'NOT_UPDATE_INVALID_PATCH'\s+USING ERRCODE = '22023';/s,
    );
    expect(noteUpdateRpc).toContain(
      'object_row.owner_id = v_user_id::text',
    );
    expect(noteUpdateRpc).toMatch(
      /NOT_UPDATE_INVALID_PHOTO_REFERENCE'\s+USING ERRCODE = '23514'/s,
    );
  });

  it('eski client INSERTini auth.uid ile sahipler ve kimlik kolonlarini UPDATEte degismez kilar', () => {
    expect(executableSql).toMatch(
      /CREATE FUNCTION public\.enforce_notlar_identity_v1\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/s,
    );
    expect(executableSql).toMatch(
      /IF TG_OP = 'INSERT' THEN\s+IF v_user_id IS NOT NULL THEN\s+NEW\.created_by := v_user_id;/s,
    );

    for (const column of [
      'id',
      'isletme_id',
      'created_by',
      'created_at',
    ]) {
      expect(executableSql).toContain(
        `NEW.${column} IS DISTINCT FROM OLD.${column}`,
      );
    }

    expect(executableSql).toContain(
      "RAISE EXCEPTION 'NOTLAR_IMMUTABLE_IDENTITY'",
    );
    expect(executableSql).toContain("ERRCODE = '42501'");
    expect(executableSql).toMatch(
      /CREATE TRIGGER trg_notlar_enforce_identity_v1\s+BEFORE INSERT OR UPDATE ON public\.notlar\s+FOR EACH ROW/s,
    );
  });

  it('yeni veya iliskisi degisen notlarda exact ayni-isletme hedeflerini dogrular', () => {
    for (const validationFlag of [
      'v_validate_entity',
      'v_validate_cari_assignment',
      'v_validate_personel_assignment',
      'v_validate_user_assignment',
    ]) {
      expect(executableSql).toMatch(
        new RegExp(`${validationFlag} := true;`),
      );
    }

    expect(executableSql).toMatch(
      /v_validate_entity :=\s+NEW\.entity_type IS DISTINCT FROM OLD\.entity_type\s+OR NEW\.entity_id IS DISTINCT FROM OLD\.entity_id;/s,
    );
    expect(executableSql).toMatch(
      /v_validate_cari_assignment :=\s+NEW\.assigned_to_cari IS DISTINCT FROM OLD\.assigned_to_cari;/s,
    );
    expect(executableSql).toMatch(
      /v_validate_personel_assignment :=\s+NEW\.assigned_to_personel IS DISTINCT FROM OLD\.assigned_to_personel;/s,
    );
    expect(executableSql).toMatch(
      /v_validate_user_assignment :=\s+NEW\.assigned_to_user IS DISTINCT FROM OLD\.assigned_to_user;/s,
    );

    for (const tableName of [
      'hesaplar',
      'cariler',
      'personel',
      'urunler',
    ]) {
      const tableUseIndex = executableSql.indexOf(
        `FROM public.${tableName}`,
      );
      const tableUse = executableSql.slice(
        tableUseIndex,
        executableSql.indexOf(') THEN', tableUseIndex),
      );

      expect(tableUseIndex).toBeGreaterThan(-1);
      expect(tableUse).toContain(
        '.isletme_id = NEW.isletme_id',
      );
    }

    expect(executableSql).toContain(
      "RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'",
    );
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'NOTLAR_INVALID_CARI_ASSIGNMENT'",
    );
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'NOTLAR_INVALID_PERSONEL_ASSIGNMENT'",
    );
    expect(executableSql).toMatch(
      /v_validate_photo :=\s+NEW\.photo_path IS DISTINCT FROM OLD\.photo_path[\s\S]*?FROM storage\.objects AS object_row[\s\S]*?object_row\.bucket_id = 'islem-photos'[\s\S]*?object_row\.name = NEW\.photo_path/s,
    );
    expect(executableSql).toMatch(
      /object_row\.name = NEW\.photo_path\s+AND \(\s*v_user_id IS NULL\s+OR object_row\.owner_id = v_user_id::text\s*\)/s,
    );
    expect(executableSql).toMatch(
      /NOTLAR_INVALID_PHOTO_REFERENCE'\s+USING ERRCODE = '23514'/s,
    );
  });

  it('kullanici atamasini ayni isletmenin sahibi veya aktif uyesiyle sinirlar', () => {
    expect(executableSql).toMatch(
      /FROM public\.isletmeler AS business_row[\s\S]*?business_row\.id = NEW\.isletme_id[\s\S]*?business_row\.user_id = NEW\.assigned_to_user/s,
    );
    expect(executableSql).toMatch(
      /FROM public\.isletme_users AS member_row[\s\S]*?member_row\.isletme_id = NEW\.isletme_id[\s\S]*?member_row\.user_id = NEW\.assigned_to_user[\s\S]*?member_row\.status = 'active'/s,
    );
    expect(executableSql).toContain(
      "RAISE EXCEPTION 'NOTLAR_INVALID_USER_ASSIGNMENT'",
    );
  });

  it('ayni-isletme kontrolunu dar SECURITY DEFINER triggerinda tutup dogrudan RPC erisimini kapatir', () => {
    expect(executableSql).toMatch(
      /SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/s,
    );
    expect(executableSql).toContain(
      'REVOKE ALL ON FUNCTION public.enforce_notlar_identity_v1()\n  FROM PUBLIC, anon, authenticated, service_role;',
    );
    expect(executableSql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.enforce_notlar_identity_v1/i,
    );
    expect(executableSql).toContain(
      'v_function_secdef IS DISTINCT FROM true',
    );

    for (const role of [
      'anon',
      'authenticated',
      'service_role',
    ]) {
      expect(executableSql).toMatch(
        new RegExp(
          `OR pg_catalog\\.has_function_privilege\\(\\s*'${role}',\\s*v_function_oid,\\s*'EXECUTE'\\s*\\)`,
          's',
        ),
      );
    }
  });

  it('SECURITY DEFINER hedef sorgularindan once authenticated aktorun tenant baglamini dogrular', () => {
    const actorGuardIndex = executableSql.indexOf(
      "RAISE EXCEPTION 'NOTLAR_INVALID_TENANT_CONTEXT'",
    );
    const firstTargetValidationIndex = executableSql.indexOf(
      "RAISE EXCEPTION 'NOTLAR_INVALID_ENTITY_REFERENCE'",
    );
    const actorGuard = executableSql.slice(
      executableSql.indexOf('IF v_user_id IS NOT NULL'),
      actorGuardIndex,
    );

    expect(actorGuardIndex).toBeGreaterThan(-1);
    expect(actorGuardIndex).toBeLessThan(firstTargetValidationIndex);
    expect(actorGuard).toMatch(
      /public\.isletmeler AS actor_business_row[\s\S]*?actor_business_row\.id = NEW\.isletme_id[\s\S]*?actor_business_row\.user_id = v_user_id/s,
    );
    expect(actorGuard).toMatch(
      /public\.isletme_users AS actor_member_row[\s\S]*?actor_member_row\.isletme_id = NEW\.isletme_id[\s\S]*?actor_member_row\.user_id = v_user_id[\s\S]*?actor_member_row\.status = 'active'/s,
    );
    expect(executableSql).toMatch(
      /NOTLAR_INVALID_TENANT_CONTEXT'\s+USING ERRCODE = '42501'/s,
    );
  });

  it('legacy NULL satirlari backfill etmez; own sahiplenemez, all yonetebilir', () => {
    expect(migration).toContain(
      "Mevcut bozuk referans, iliski alanlari degismeyen UPDATE'te yeniden dogrulanmaz.",
    );
    expect(updatePolicy).toMatch(
      /can_update_all IS TRUE\s+OR \(\s*action_permission\.can_update_own IS TRUE\s+AND notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(deletePolicy).toMatch(
      /can_delete_all IS TRUE\s+OR \(\s*action_permission\.can_delete_own IS TRUE\s+AND notlar\.created_by = auth\.uid\(\)/s,
    );
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+public\.notlar\s+SET\b/i,
    );
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+notlar\s+SET\b/i,
    );
  });

  it('anon tablo erisimini kapatip authenticateda yalniz CRUD birakir', () => {
    expect(executableSql).toContain(
      'REVOKE ALL ON TABLE public.notlar FROM PUBLIC, anon, authenticated;',
    );
    expect(executableSql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notlar TO authenticated;',
    );
    expect(executableSql).not.toMatch(
      /GRANT[^;]*(?:TRUNCATE|REFERENCES|TRIGGER)[^;]*TO authenticated/i,
    );
    expect(executableSql).toContain(
      'pg_catalog.aclexplode(',
    );
    expect(executableSql).not.toMatch(
      /has_(?:table|function)_privilege\(\s*'PUBLIC'/,
    );
  });

  it('tabloya veya kullanici satirlarina DML ve yikici schema islemi yapmaz', () => {
    expect(executableSql).not.toMatch(/\bDROP\b/i);
    expect(executableSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(executableSql).not.toMatch(
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i,
    );
    expect(executableSql).not.toMatch(
      /\bINSERT\s+INTO\s+(?:public\.)?notlar\b/i,
    );
    expect(executableSql).not.toMatch(
      /\bDELETE\s+FROM\s+(?:public\.)?notlar\b/i,
    );
    // Migration calisirken mevcut satira DML yoktur. Tek UPDATE, daha sonra
    // authenticated client cagirinca calisacak tam not update RPC govdesindedir.
    expect(
      executableSql.match(
        /\bUPDATE\s+public\.notlar\s+AS\s+note_row\s+SET\b/gi,
      ),
    ).toHaveLength(1);
    expect(executableSql).not.toMatch(
      /\bUPDATE\s+notlar\s+SET\b/i,
    );
  });

  it('uretimde uzun lock beklemek yerine kisa timeout ile guvenli fail eder', () => {
    expect(executableSql).toContain("SET lock_timeout TO '5s';");
    expect(executableSql).toContain(
      "SET statement_timeout TO '120s';",
    );
    expect(executableSql).toContain('RESET statement_timeout;');
    expect(executableSql).toContain('RESET lock_timeout;');
    expect(
      executableSql.indexOf("SET lock_timeout TO '5s';"),
    ).toBeLessThan(
      executableSql.indexOf('DO $notlar_guard$'),
    );
    expect(executableSql.trimEnd()).toMatch(
      /RESET statement_timeout;\s+RESET lock_timeout;$/,
    );
  });

  it('eski-client ve audit sonrasi zorunlu client deltalarini kayda alir', () => {
    for (const contractText of [
      'ESKI CLIENT',
      '1.5.x',
      'create input allowlist',
      'DELETE, silinen id',
      'query key V2 + user + yetki',
      'persist:false',
      'coklu entity/assignment baglari OR degil KESISIM',
      'assigned_to_user atamasi yetki vermez',
      'insert/update().select().single()',
      'Yeni client client-generated UUID',
      'dar policy + delta trigger',
      'Storage not fotografi politikalari',
    ]) {
      expect(migration).toContain(contractText);
    }
  });
});
