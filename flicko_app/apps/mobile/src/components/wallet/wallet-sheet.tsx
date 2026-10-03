import { StyleSheet, Text, View } from "react-native";

import { TextButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatSkr, useSkrBalance } from "@/features/wallet/skr-balance";
import { useSession } from "@/store/session";
import { cam, colors, ref, type } from "@/theme";

/*
 * Wallet sheet from the camera's SKR pill. A stub for now: address and SKR balance.
 */
export function WalletSheet({ onClose }: { onClose: () => void }) {
  const session = useSession((s) => s.session);
  const balance = useSkrBalance(session?.wallet);
  const short = session
    ? `${session.wallet.slice(0, 4)}…${session.wallet.slice(-4)}`
    : "";

  return (
    <Sheet height={260} onClose={onClose}>
      <Text style={[type.sheetTitle, { color: colors.text }]}>Wallet</Text>
      <View style={styles.balance}>
        <View style={styles.coin} />
        <Text style={styles.amount}>
          {balance.data === undefined ? "–" : formatSkr(balance.data)} SKR
        </Text>
      </View>
      <Text style={styles.address}>
        {session?.walletLabel ? `${session.walletLabel} · ` : ""}
        {short}
      </Text>
      <TextButton label="Close" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  balance: { flexDirection: "row", alignItems: "center", gap: 10 },
  coin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: cam.coin,
    borderWidth: 3,
    borderColor: cam.coinRim,
  },
  amount: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 34,
    color: colors.text,
  },
  address: { fontFamily: "DMSans_500Medium", fontSize: 14, color: ref.textSoft },
});
