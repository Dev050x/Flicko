import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChangeChip } from "@/components/ui/change-chip";
import { Bone } from "@/components/profile/skeleton";
import { grouped } from "@/lib/format";
import { colors, mono, profile as p } from "@/theme";

export interface Money {
  total: number;
  changePct: number;
  cash: number;
  memes: number;
  sol: number;
  claimable: number;
  allTime: number;
  launched: boolean;
}

const skr = (n: number) =>
  n >= 100
    ? grouped(n)
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/*
 * One card, two halves split by a hairline: portfolio (total, today's change, cash /
 * memes / gas) and creator earnings. Claim is the only pink on the screen.
 */
export function MoneyCard({
  money,
  claiming,
  onClaim,
  onOpenCamera,
}: {
  money: Money | null;
  claiming: boolean;
  onClaim: () => void;
  onOpenCamera: () => void;
}) {
  if (!money) {
    return (
      <View style={styles.card}>
        <Bone width={90} height={14} />
        <Bone width={160} height={30} />
        <Bone width="100%" height={1} style={{ marginVertical: 4 }} />
        <Bone width="70%" height={36} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.portfolio}>
        <View style={{ gap: 4 }}>
          <Text style={styles.label}>Portfolio</Text>
          <Text
            style={styles.total}
            accessibilityLabel={`Portfolio ${skr(money.total)} SKR`}
          >
            {skr(money.total)} <Text style={styles.unit}>SKR</Text>
          </Text>
          <View style={styles.today}>
            <ChangeChip pct={money.changePct} size="sm" />
            <Text style={styles.todayText}>today</Text>
          </View>
        </View>
        <View style={styles.breakdown}>
          <Line label="Cash" value={`${skr(money.cash)} SKR`} />
          <Line label="Memes" value={`${skr(money.memes)} SKR`} />
          <Line label="Gas" value={`${money.sol.toFixed(2)} SOL`} />
        </View>
      </View>

      <View style={styles.divider} />

      {money.launched ? (
        <View style={styles.earn}>
          <View style={styles.earnText}>
            <Text style={styles.label}>Creator earnings</Text>
            {money.claimable > 0 ? (
              <Text style={styles.ready}>
                {skr(money.claimable)} SKR{" "}
                <Text style={styles.readyNote}>ready</Text>
              </Text>
            ) : (
              <Text style={styles.nothing}>Nothing to claim yet</Text>
            )}
            <Text style={styles.caption}>
              2% of every trade on your memes · {skr(money.allTime)} SKR all
              time
            </Text>
          </View>
          {money.claimable > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Claim ${skr(money.claimable)} SKR`}
              accessibilityState={{ busy: claiming }}
              disabled={claiming}
              onPress={onClaim}
              style={[styles.claim, claiming && { opacity: 0.7 }]}
            >
              <Text style={styles.claimText}>
                {claiming ? "Claiming…" : "Claim"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.earn}>
          <View style={styles.earnText}>
            <Text style={styles.label}>Creator earnings</Text>
            <Text style={styles.caption}>
              Launch a meme to start earning 2% of every trade
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenCamera}
            hitSlop={8}
          >
            <Text style={styles.link}>Open camera</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <Text style={styles.line}>
    {label} <Text style={styles.lineValue}>{value}</Text>
  </Text>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  portfolio: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontFamily: "DMSans_400Regular", fontSize: 13, color: p.muted },
  total: { fontFamily: mono.medium, fontSize: 26, color: colors.text },
  unit: { fontSize: 15, color: p.muted },
  today: { flexDirection: "row", alignItems: "center", gap: 6 },
  todayText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: p.muted },
  breakdown: { alignItems: "flex-end", gap: 6, paddingTop: 2 },
  line: { fontFamily: "DMSans_400Regular", fontSize: 13, color: p.muted },
  lineValue: { fontFamily: mono.medium, color: colors.text },
  divider: { height: 1, backgroundColor: p.line },
  earn: { flexDirection: "row", alignItems: "center", gap: 12 },
  earnText: { flex: 1, gap: 2 },
  ready: { fontFamily: mono.medium, fontSize: 16, color: colors.text },
  readyNote: { fontFamily: "DMSans_400Regular", fontSize: 12, color: p.muted },
  nothing: { fontFamily: "DMSans_400Regular", fontSize: 14, color: p.muted },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 11, color: p.dim },
  claim: {
    width: 84,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  claimText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
  link: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.text },
});
