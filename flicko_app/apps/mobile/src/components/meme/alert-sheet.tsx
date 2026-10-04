import { useEffect, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BellIcon } from "@/components/markets/icons";
import { CloseIcon } from "@/components/ui/icons";
import {
  toBaseUnits,
  useAlerts,
  useCreateAlert,
  useDeleteAlert,
  type AlertDirection,
} from "@/features/alerts/api";
import { priceCompact } from "@/lib/format";
import { registerPush } from "@/lib/push";
import { useSession } from "@/store/session";
import { detail as D, geist } from "@/theme";

/*
 * "Ping me when $TICKER goes above/below X". The direction follows the typed price
 * (above the current price → Above) until it's picked by hand. Saving also registers
 * the device for pushes; if that isn't possible on this build the alert is still
 * saved and the sheet says so.
 */
export function AlertSheet({
  mint,
  symbol,
  priceSkr,
  bottomInset,
  onClose,
  onSaved,
}: {
  mint: string;
  symbol: string;
  priceSkr: number;
  bottomInset: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const session = useSession((s) => s.session);
  const alerts = useAlerts(mint);
  const create = useCreateAlert(mint);
  const remove = useDeleteAlert(mint);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [picked, setPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyboard = useKeyboardHeight();

  const units = toBaseUnits(text);
  const target = units === null ? null : Number(units) / 1e6;

  useEffect(() => {
    if (!picked && target !== null)
      setDirection(target >= priceSkr ? "above" : "below");
  }, [target, priceSkr, picked]);

  const save = async () => {
    if (!session || units === null) return;
    setError(null);
    try {
      await create.mutateAsync({ price: units, direction });
      setText("");
      setPicked(false);
      const pushing = await registerPush(session.token);
      const set = `Alert set: $${symbol} ${direction} ${priceCompact(target!)} SKR`;
      // Without push (no Firebase on this build yet) the alert is saved but can't ping.
      onSaved(pushing ? set : `${set}. Push isn't set up on this build yet.`);
    } catch (err) {
      setError(
        (err as Error).message.includes("at most")
          ? "You have the most alerts this meme allows. Remove one first."
          : "Couldn't save the alert. Try again.",
      );
    }
  };

  const active = (alerts.data ?? []).filter((a) => !a.triggered);
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        style={styles.dim}
        onPress={onClose}
      />
      <View style={styles.anchor} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            // Sit on top of the keyboard while typing so the input stays visible.
            { paddingBottom: (keyboard > 0 ? keyboard : bottomInset) + 16 },
          ]}
        >
          <View style={styles.head}>
            <Text style={styles.title}>Price alert</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={10}
            >
              <CloseIcon size={20} color={D.secondary} />
            </Pressable>
          </View>
          <Text style={styles.note}>
            Now <Text style={styles.num}>{priceCompact(priceSkr)}</Text> SKR.
            We'll ping you once when ${symbol} crosses your price.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setError(null);
              }}
              placeholder={priceCompact(priceSkr).replace(/[₀-₉]/g, "")}
              placeholderTextColor={D.pending}
              keyboardType="decimal-pad"
              style={styles.input}
              accessibilityLabel="Target price in SKR"
            />
            <Text style={styles.unit}>SKR</Text>
          </View>

          <View style={styles.segment}>
            {(["above", "below"] as const).map((d) => {
              const on = d === direction;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setDirection(d);
                    setPicked(true);
                  }}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                >
                  <Text
                    style={[styles.segmentText, on && styles.segmentTextOn]}
                  >
                    {d === "above" ? "Goes above" : "Goes below"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: units === null || create.isPending,
            }}
            disabled={units === null || create.isPending}
            onPress={save}
            style={[
              styles.save,
              (units === null || create.isPending) && { opacity: 0.4 },
            ]}
          >
            <BellIcon size={18} color={D.bg} />
            <Text style={styles.saveText}>
              {create.isPending ? "Saving…" : "Set alert"}
            </Text>
          </Pressable>

          {active.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={styles.listTitle}>Your alerts</Text>
              {active.map((a) => (
                <View key={a.id} style={styles.alertRow}>
                  <Text style={styles.alertText}>
                    {a.direction === "above" ? "Above" : "Below"}{" "}
                    <Text style={styles.num}>{priceCompact(a.price)}</Text> SKR
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove alert"
                    hitSlop={10}
                    onPress={() => remove.mutate(a.id)}
                  >
                    <CloseIcon size={16} color={D.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* Keyboard height while it's open. Android only has the "did" events. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

const styles = StyleSheet.create({
  dim: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(5,5,8,0.6)",
  },
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 18,
    backgroundColor: D.bg,
    borderTopWidth: 1,
    borderColor: D.line,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontFamily: geist.semibold, fontSize: 18, color: D.text },
  note: {
    fontFamily: geist.regular,
    fontSize: 13,
    lineHeight: 19,
    color: D.muted,
  },
  num: {
    fontFamily: geist.medium,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: D.radius,
  },
  input: {
    flex: 1,
    padding: 0,
    fontFamily: geist.semibold,
    fontSize: 22,
    color: D.text,
    fontVariant: ["tabular-nums"],
  },
  unit: { fontFamily: geist.regular, fontSize: 15, color: D.secondary },
  segment: { flexDirection: "row", gap: 8 },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: D.line,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: D.chipOn, borderColor: D.chipOn },
  segmentText: { fontFamily: geist.medium, fontSize: 14, color: D.secondary },
  segmentTextOn: { color: D.bg },
  error: { fontFamily: geist.regular, fontSize: 13, color: D.loss },
  save: {
    height: 50,
    borderRadius: 25,
    backgroundColor: D.chipOn,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { fontFamily: geist.semibold, fontSize: 16, color: D.bg },
  listTitle: {
    fontFamily: geist.semibold,
    fontSize: 14,
    color: D.text,
    marginBottom: 4,
  },
  alertRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: D.rowLine,
  },
  alertText: { fontFamily: geist.regular, fontSize: 14, color: D.secondary },
});
