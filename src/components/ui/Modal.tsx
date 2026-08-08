import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal as RNModal, StyleSheet, View, type ModalProps } from 'react-native';
import { ModalInsets } from './ModalInsets';

interface InlineModalHostValue {
  upsert: (id: number, node: ReactNode) => void;
  remove: (id: number) => void;
}

const InlineModalHostContext = createContext<InlineModalHostValue | null>(null);
let nextInlineModalId = 1;

export interface AppModalProps extends ModalProps {
  /**
   * Zaten acik bir native Modal icinde gosterilecek picker/sheet icin yeni bir
   * native pencere acmaz; parent modalin icinde mutlak konumlu katman kullanir.
   */
  inline?: boolean;
}

/**
 * React Native'in Modal'ının yerine geçen sarmalayıcı — içeriğini otomatik
 * olarak ModalInsets ile sarar.
 *
 * NEDEN: iOS'ta Modal AYRI BİR NATIVE PENCEREDE açılıyor; PersistentTabBar kök
 * View'in içinde kaldığı için modalın altında kalıyor, yani çizilmiyor. Ama
 * React ağacı değişmediğinden modal içindeki useSafeAreaInsets() hâlâ
 * _layout'un override'lı değerini (gerçek safe-area + tab bar yüksekliği)
 * döndürüyor → bar'ın GÖRÜNMEDİĞİ her sheet'te ~72px hayalet alt boşluk.
 *
 * NEDEN SARMALAYICI: düzeltmeyi 26 dosyada tek tek <ModalInsets> yazarak yapmak
 * hem kırılgan (yuvalanmış modallarda JSX ağacı bozulabiliyor) hem de her yeni
 * modalda yeniden hatırlanması gereken bir şey olurdu. Import'u değiştirmek
 * yeterli: `from 'react-native'` → `from '@/components/ui'`. Yeni modal yazan
 * kimse ayrıca bir şey düşünmez.
 *
 * Props RN Modal ile birebir aynı; `inline` yalnız nested-modal güvenliği içindir.
 */
export function Modal({ children, inline = false, visible = true, ...props }: AppModalProps) {
  const parentInlineHost = useContext(InlineModalHostContext);
  const inlineIdRef = useRef<number | null>(null);
  if (inlineIdRef.current === null) {
    inlineIdRef.current = nextInlineModalId++;
  }
  const inlineId = inlineIdRef.current;

  // Her native modal kendi inline katmanlarini native pencerenin KOKUNDE toplar.
  // Boylece derin bir form satirinda acilan inline picker, en yakin View'in olculeriyle
  // sinirlanmaz ve yine de ikinci bir RN Modal olusturmaz.
  const [inlineEntries, setInlineEntries] = useState<Map<number, ReactNode>>(
    () => new Map(),
  );
  const upsertInlineEntry = useCallback((id: number, node: ReactNode) => {
    setInlineEntries((current) => {
      if (current.get(id) === node) return current;
      const next = new Map(current);
      next.set(id, node);
      return next;
    });
  }, []);
  const removeInlineEntry = useCallback((id: number) => {
    setInlineEntries((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  const inlineHost = useMemo<InlineModalHostValue>(() => ({
    upsert: upsertInlineEntry,
    remove: removeInlineEntry,
  }), [removeInlineEntry, upsertInlineEntry]);

  const inlineLayer = useMemo(() => (
    visible ? (
      <View
        key={`inline-modal-${inlineId}`}
        style={styles.inlineRoot}
        pointerEvents="box-none"
        accessibilityViewIsModal
      >
        <ModalInsets>{children}</ModalInsets>
      </View>
    ) : null
  ), [children, inlineId, visible]);

  useLayoutEffect(() => {
    if (!inline || !parentInlineHost) return;

    if (inlineLayer) parentInlineHost.upsert(inlineId, inlineLayer);
    else parentInlineHost.remove(inlineId);
  }, [inline, inlineId, inlineLayer, parentInlineHost]);

  useLayoutEffect(() => {
    if (!inline || !parentInlineHost) return;
    return () => parentInlineHost.remove(inlineId);
  }, [inline, inlineId, parentInlineHost]);

  if (inline) {
    // Bir native Modal agacindaysak katmani onun kok host'una tasiriz. Host yoksa
    // eski davranis korunur (inline katman bulundugu yuzeye gore konumlanir).
    if (parentInlineHost || !inlineLayer) return null;

    return inlineLayer;
  }

  return (
    <RNModal visible={visible} {...props}>
      <ModalInsets>
        <InlineModalHostContext.Provider value={inlineHost}>
          {children}
          {Array.from(inlineEntries.values())}
        </InlineModalHostContext.Provider>
      </ModalInsets>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  inlineRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
});
