import {
  classifyMutationError,
  getStableServerErrorMessageKey,
  getTransactionActionDeniedMessageKey,
  getTransactionMutationMessageKey,
  isPermissionDeniedError,
  MutationRetryPayloadChangedError,
  ProductAtomicWriteUnavailableError,
  toErrorMessage,
  TransactionPermissionError,
} from '../errors';
import i18n from '@/i18n';

describe('isPermissionDeniedError', () => {
  it.each([
    [{ code: '42501', message: 'hidden server detail' }],
    [{ status: 403, message: 'Forbidden' }],
    [new Error('PERMISSION_DENIED')],
    [{ code: 'PERMISSION_DENIED' }],
  ])('recognizes stable permission denial shape %#', (error) => {
    expect(isPermissionDeniedError(error)).toBe(true);
  });

  it('does not turn validation or generic failures into permission errors', () => {
    expect(isPermissionDeniedError({ code: '23514' })).toBe(false);
    expect(isPermissionDeniedError(new Error('UPLOAD_FAILED'))).toBe(false);
  });
});

describe('toErrorMessage', () => {
  it.each([
    'ACCOUNT_HAS_LINKED_RECORDS',
    'CUSTOMER_HAS_LINKED_RECORDS',
    'PERSONNEL_HAS_LINKED_RECORDS',
    'PRODUCT_HAS_LINKED_TRANSACTIONS',
  ])('maps linked-delete server token to a friendly message: %s', (token) => {
    expect(
      getStableServerErrorMessageKey({ code: '23503', message: token }),
    ).toBe('common:errors.hasLinkedRecords');
    expect(toErrorMessage({ code: '23503', message: token })).toBe(
      i18n.t('common:errors.hasLinkedRecords'),
    );
  });

  it('maps direct note-context detach denial without exposing its SQL token', () => {
    const error = {
      code: '42501',
      message: 'NOTLAR_DIRECT_ENTITY_DETACH_FORBIDDEN',
    };

    expect(getStableServerErrorMessageKey(error)).toBe(
      'common:errors.noteContextServerManaged',
    );
    expect(toErrorMessage(error)).toBe(
      i18n.t('common:errors.noteContextServerManaged'),
    );
    expect(classifyMutationError(new Error(error.message))).toBe('permission');
  });

  it('keeps unknown server messages unchanged', () => {
    const error = { code: '23503', message: 'UNKNOWN_LINKED_REFERENCE' };

    expect(getStableServerErrorMessageKey(error)).toBeNull();
    expect(toErrorMessage(error)).toBe('UNKNOWN_LINKED_REFERENCE');
  });

  it('classifies linked-delete tokens as validation even if an adapter drops SQLSTATE', () => {
    expect(
      classifyMutationError(new Error('ACCOUNT_HAS_LINKED_RECORDS')),
    ).toBe('validation');
  });

  describe('string errors', () => {
    it('should return the string directly', () => {
      expect(toErrorMessage('something went wrong')).toBe('something went wrong');
    });

    it('should return empty string for empty input', () => {
      expect(toErrorMessage('')).toBe('');
    });
  });

  describe('Error objects', () => {
    it('should extract message from Error instance', () => {
      expect(toErrorMessage(new Error('fail'))).toBe('fail');
    });

    it('should extract message from TypeError', () => {
      expect(toErrorMessage(new TypeError('type fail'))).toBe('type fail');
    });

    it('should extract message from RangeError', () => {
      expect(toErrorMessage(new RangeError('range fail'))).toBe('range fail');
    });
  });

  describe('objects with message property', () => {
    it('should extract message from plain object with string message', () => {
      expect(toErrorMessage({ message: 'obj error' })).toBe('obj error');
    });

    it('should fallback when message is a number', () => {
      expect(toErrorMessage({ message: 42 })).toBe('An unexpected error occurred');
    });

    it('should fallback when message is an object', () => {
      expect(toErrorMessage({ message: { nested: true } })).toBe('An unexpected error occurred');
    });
  });

  describe('null, undefined, and other types', () => {
    it('should return default fallback for null', () => {
      expect(toErrorMessage(null)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for undefined', () => {
      expect(toErrorMessage(undefined)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for a number', () => {
      expect(toErrorMessage(42)).toBe('An unexpected error occurred');
    });

    it('should return default fallback for boolean', () => {
      expect(toErrorMessage(true)).toBe('An unexpected error occurred');
    });
  });

  describe('custom fallback', () => {
    it('should use custom fallback when error is null', () => {
      expect(toErrorMessage(null, 'custom msg')).toBe('custom msg');
    });

    it('should use custom fallback when error is undefined', () => {
      expect(toErrorMessage(undefined, 'ops')).toBe('ops');
    });

    it('should NOT use fallback when error is a string', () => {
      expect(toErrorMessage('real error', 'fallback')).toBe('real error');
    });

    it('should NOT use fallback when error is an Error object', () => {
      expect(toErrorMessage(new Error('real'), 'fallback')).toBe('real');
    });
  });
});

describe('classifyMutationError', () => {
  it('typed ownership reddini genel 42501 yerine ownership olarak korur', () => {
    const error = new TransactionPermissionError(
      'update',
      'ownership',
      'Bu işlem başka bir kullanıcı tarafından oluşturulduğu için düzenlenemez',
    );

    expect(classifyMutationError(error)).toBe('ownership');
    expect(getTransactionMutationMessageKey(error, 'update')).toBe(
      'transactions:permissions.otherUserUpdateDenied',
    );
  });

  it.each([
    [{ code: '42501', message: 'permission denied' }],
    [{ status: 403, message: 'Forbidden' }],
    [new Error('Bu işlemi güncelleme yetkiniz yok')],
  ])('kararlı kodu veya legacy mesajı yetki reddi olarak sınıflandırır', (error) => {
    expect(classifyMutationError(error)).toBe('permission');
  });

  it.each([
    [{ code: 'PGRST003', message: 'pool timeout' }],
    [{ code: 'ETIMEDOUT', message: 'request timed out' }],
    [new TypeError('Network request failed')],
  ])('sonucu belirsiz bağlantı hatasını ayırır', (error) => {
    expect(classifyMutationError(error)).toBe('network_unknown');
  });

  it('istek gönderilmeden oluşan yerel offline hatasını kesin olarak ayırır', () => {
    const error = new TypeError(
      'Network request skipped because the device is offline',
    );

    expect(classifyMutationError(error)).toBe('network_not_sent');
    expect(getTransactionMutationMessageKey(error, 'create')).toBe(
      'transactions:messages.saveNotLanded',
    );
    expect(getTransactionMutationMessageKey(error, 'delete')).toBe(
      'transactions:messages.deleteNotSent',
    );
  });

  it('conflict ve validation hatalarını kararlı kodlarla ayırır', () => {
    expect(classifyMutationError({ code: '23505' })).toBe('conflict');
    expect(classifyMutationError({ code: '23505', status: 503 })).toBe('conflict');
    expect(classifyMutationError({ code: '23503' })).toBe('validation');
    expect(getTransactionMutationMessageKey({ code: '23503' }, 'update')).toBe(
      'transactions:messages.invalidMutationData',
    );
    expect(classifyMutationError({ code: '23514' })).toBe('validation');
    expect(classifyMutationError({ code: '23514', status: 503 })).toBe('validation');
    expect(classifyMutationError({ code: '23514', message: 'Yetkisiz değer' })).toBe(
      'validation',
    );
  });

  it('bilinmeyen server kodunu yalnız mesajında yetkisiz geçti diye permission saymaz', () => {
    expect(
      classifyMutationError({ code: 'XX000', message: 'Yetkisiz değer' }),
    ).toBe('generic');
  });

  it('sıradan hatayı yanlışlıkla yetki veya ağ hatası saymaz', () => {
    expect(classifyMutationError(new Error('İşlem gerçekleştirilemedi'))).toBe('generic');
  });

  it('aksiyona göre doğru kullanıcı mesajı anahtarını üretir', () => {
    const denied = { code: '42501', message: 'permission denied' };
    expect(getTransactionMutationMessageKey(denied, 'create')).toBe(
      'transactions:permissions.createDenied',
    );
    expect(getTransactionMutationMessageKey(denied, 'update')).toBe(
      'transactions:permissions.updateDenied',
    );
    expect(getTransactionMutationMessageKey(denied, 'delete')).toBe(
      'transactions:permissions.deleteDenied',
    );
    expect(
      getTransactionMutationMessageKey(new TypeError('Network request failed'), 'update'),
    ).toBe('transactions:messages.saveOutcomeUnknown');
  });

  it.each([
    'ISLEM_MUTATION_V2_FEATURE_UNSUPPORTED',
    'ISLEM_MUTATION_V2_LINKED_CARI_UNSUPPORTED',
  ])('maps a stable shared-mutation unsupported identifier: %s', (identifier) => {
    expect(
      getTransactionMutationMessageKey(
        { code: '0A000', message: identifier },
        'update',
      ),
    ).toBe('transactions:permissions.sharedMutationUnsupported');
  });

  it('yerel preflight yalnız kesin edit_own/başka creator durumunda sahiplik der', () => {
    expect(
      getTransactionActionDeniedMessageKey('update', {
        createdBy: 'other-user',
        currentUserId: 'current-user',
        canActOnOwnRecord: true,
        canActOnRecord: false,
      }),
    ).toBe('transactions:permissions.otherUserUpdateDenied');

    expect(
      getTransactionActionDeniedMessageKey('update', {
        createdBy: 'other-user',
        currentUserId: 'current-user',
        canActOnOwnRecord: false,
        canActOnRecord: false,
      }),
    ).toBe('transactions:permissions.updateDenied');

    expect(
      getTransactionActionDeniedMessageKey('update', {
        createdBy: 'other-user',
        currentUserId: 'current-user',
        canActOnOwnRecord: true,
        canActOnRecord: true,
        ownerOnlyRestriction: true,
      }),
    ).toBe('transactions:permissions.ownerOnlyEdit');
  });

  it('yerel idempotency ve atomik endpoint hatalarÄ±na aÃ§Ä±k mesaj verir', () => {
    const changedPayload = new MutationRetryPayloadChangedError();
    expect(classifyMutationError(changedPayload)).toBe('conflict');
    expect(getTransactionMutationMessageKey(changedPayload, 'create')).toBe(
      'transactions:messages.retryPayloadChanged',
    );

    expect(
      getTransactionMutationMessageKey(
        new ProductAtomicWriteUnavailableError({ code: '42883' }),
        'create',
      ),
    ).toBe('transactions:messages.productAtomicWriteUnavailable');
  });
});
