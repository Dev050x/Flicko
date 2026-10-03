import { MEME_DECIMALS } from "@flicko/sdk";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SceneCanvas, useSceneAssets } from "@/components/create/scene-canvas";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { ConnectFlow } from "@/components/wallet/connect-flow";
import { config } from "@/config";
import { useLaunchConfig, useNetworkFee } from "@/features/create/chain";
import { compact, formatUnits, groupDigits, parseUnits } from "@/features/create/format";
import { LaunchSummary, Row } from "@/features/create/launch-summary";
import { sceneAspect } from "@/features/create/scene";
import {
  PRICE_TIERS,
  SUPPLY_PRESETS,
  type PriceTier,
  useCreateStore,
} from "@/features/create/store";
import { useLaunch, type LaunchStep } from "@/features/create/use-launch";
import { fitIn, useScene } from "@/features/create/use-scene";
import { filterById } from "@/features/filters/catalog";
import { isLocked, useUnlockedFilters } from "@/features/filters/unlocks";
import { useSession } from "@/store/session";
import { colors, ref } from "@/theme";

/*
 * 4 · Launch (design-reference/CreateFlow.html): name and $symbol (prefilled from the
 * caption), total supply (presets or custom 1M-10B), starting price, a live summary
 * from the SDK's launch math, the fees, and "Launch for {total} SKR".
 */
const MIN_SUPPLY = 1e6;
const MAX_SUPPLY = 1e10;
const THUMB = { width: 64, height: 80 };

const STEP_LABEL: Record<Exclude<LaunchStep, "idle">, string> = {
  preparing: "Preparing…",
  wallet: "Confirm in wallet…",
  launching: "Launching…",
};

const nameBytes = (text: string) => new TextEncoder().encode(text).length;

export default function CreateLaunch() {
  const insets = useSafeAreaInsets();
  const scene = useScene({ withCaption: true });
  const assets = useSceneAssets(scene);
  const session = useSession((s) => s.session);
  const name = useCreateStore((s) => s.name);
  const symbol = useCreateStore((s) => s.symbol);
  const setName = useCreateStore((s) => s.setName);
  const setSymbol = useCreateStore((s) => s.setSymbol);
  const supply = useCreateStore((s) => s.supply);
  const supplyMode = useCreateStore((s) => s.supplyMode);
  const setSupply = useCreateStore((s) => s.setSupply);
  const price = useCreateStore((s) => s.price);
  const setPrice = useCreateStore((s) => s.setPrice);
  const cameraFilter = useCreateStore((s) => s.filterId);
  const editFilter = useCreateStore((s) => s.edits.filterId);

  const launchConfig = useLaunchConfig();
  const networkFee = useNetworkFee(name, symbol);
  const unlocked = useUnlockedFilters();
  const { toast, show } = useToast(insets.top + 56);
  const { step, problem, launch, clearProblem } = useLaunch(() => show("Launch cancelled"));
  const [customText, setCustomText] = useState(
    supplyMode === "custom" ? groupDigits(String(supply)) : "",
  );
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = step !== "idle";


  // Back is blocked while the wallet is open or the launch is landing.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener(
        "hardwareBackPress",
        () => step === "wallet" || step === "launching",
      );
      return () => sub.remove();
    }, [step]),
  );

  // The range the program accepts, inside the design's 1M-10B.
  const cfg = launchConfig.data;
  const unit = 10 ** MEME_DECIMALS;
  const minSupply = Math.max(MIN_SUPPLY, cfg ? Number(cfg.minSupply) / unit : 0);
  const maxSupply = Math.min(MAX_SUPPLY, cfg ? Number(cfg.maxSupply) / unit : MAX_SUPPLY);
  const supplyOk = supply >= minSupply && supply <= maxSupply && Number.isInteger(supply);
  const supplyRaw = supplyOk ? BigInt(supply) * BigInt(unit) : null;
  const startPrice = parseUnits(PRICE_TIERS[price].skr, config.skrDecimals);

  const premium = [...new Set([cameraFilter, editFilter])]
    .map(filterById)
    .filter((f) => isLocked(f, unlocked.data));
  const burns = premium.reduce((sum, f) => sum + (f.priceSkr ?? 0), 0);
  const creationFee = cfg?.creationFee;
  const total =
    creationFee === undefined
      ? null
      : creationFee + BigInt(burns) * 10n ** BigInt(config.skrDecimals);

  const checkCustom = (text = customText) => {
    const value = Number(text.replace(/,/g, ""));
    if (!value || value < minSupply || value > maxSupply) {
      setSupplyError(
        `Between ${compact(minSupply)} and ${compact(maxSupply)} tokens`,
      );
    } else {
      setSupplyError(null);
    }
  };

  const nameOk = name.trim().length > 0 && nameBytes(name.trim()) <= 32;
  const symbolOk = /^[A-Z0-9]{1,10}$/.test(symbol);
  const ready =
    !!scene && nameOk && symbolOk && supplyOk && total !== null && networkFee.data !== undefined;

  const start = () => {
    if (!ready || busy) return;
    if (!useSession.getState().session) {
      setPending(true);
      setConnecting(true);
      return;
    }
    clearProblem();
    launch({
      name: name.trim(),
      symbol,
      supply: supplyRaw!,
      startPrice,
      creationFee: creationFee!,
      networkFee: networkFee.data!,
      premium,
    });
  };

  // Guests connect first; the launch continues once the wallet is connected.
  useEffect(() => {
    if (pending && session) {
      setPending(false);
      setConnecting(false);
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, session]);

  const label = busy
    ? STEP_LABEL[step as Exclude<LaunchStep, "idle">]
    : total === null
      ? "Launch"
      : total === 0n
        ? "Launch"
        : `Launch for ${formatUnits(total, config.skrDecimals)} SKR`;

  const thumb = scene ? fitIn(sceneAspect(scene), THUMB) : THUMB;

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={step === "wallet" || step === "launching"}
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
        >
          <ChevronLeftIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Launch
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.thumb}>
            {scene && (
              <SceneCanvas scene={scene} assets={assets} width={thumb.width} height={thumb.height} />
            )}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={(text) => setName(text.slice(0, 32))}
              placeholder="Name"
              placeholderTextColor={colors.textFaint}
              maxLength={32}
              editable={!busy}
              accessibilityLabel="Name"
              style={[styles.field, styles.name, !nameOk && name.length > 0 && styles.fieldBad]}
            />
            <View style={[styles.field, styles.symbolField]}>
              <Text style={styles.dollar}>$</Text>
              <TextInput
                value={symbol}
                onChangeText={(text) =>
                  setSymbol(text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))
                }
                placeholder="SYMBOL"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                editable={!busy}
                accessibilityLabel="Symbol"
                style={styles.symbol}
              />
            </View>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Total supply</Text>
          <Segments
            options={[
              ...SUPPLY_PRESETS.map((n) => ({ id: String(n), label: compact(n) })),
              { id: "custom", label: "Custom" },
            ]}
            value={supplyMode === "custom" ? "custom" : String(supply)}
            onChange={(id) => {
              if (id === "custom") {
                const value = Number(customText.replace(/,/g, "")) || 0;
                setSupply(value, "custom");
                if (customText) checkCustom();
              } else {
                setSupplyError(null);
                setSupply(Number(id), "preset");
              }
            }}
          />
          {supplyMode === "custom" && (
            <>
              <View style={[styles.customRow, supplyError && styles.fieldBad]}>
                <TextInput
                  value={customText}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, "").slice(0, 11);
                    const grouped = groupDigits(digits);
                    setCustomText(grouped);
                    setSupply(Number(digits) || 0, "custom");
                  }}
                  onBlur={() => checkCustom()}
                  keyboardType="number-pad"
                  placeholder="69,420,000"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel="Custom supply"
                  style={styles.customInput}
                />
                <Text style={styles.customSymbol}>{symbol ? `$${symbol}` : ""}</Text>
              </View>
              <Text style={[styles.helper, supplyError && { color: colors.loss }]}>
                {supplyError ?? `Between ${compact(minSupply)} and ${compact(maxSupply)} tokens`}
              </Text>
            </>
          )}
        </View>

        <View style={styles.group}>
          <Text style={styles.groupLabel}>Starting price</Text>
          <Segments
            options={(Object.keys(PRICE_TIERS) as PriceTier[]).map((id) => ({
              id,
              label: PRICE_TIERS[id].label,
              sub: `${PRICE_TIERS[id].skr} SKR`,
            }))}
            value={price}
            onChange={(id) => setPrice(id as PriceTier)}
          />
        </View>

        <LaunchSummary
          supply={supplyRaw}
          startPrice={startPrice}
          symbol={symbol}
          skrDecimals={config.skrDecimals}
          creatorFeeBps={cfg?.creatorFeeBps}
        />

        <View style={{ gap: 6 }}>
          <Row
            label="Creation fee (burned)"
            value={creationFee === undefined ? "–" : `${formatUnits(creationFee, config.skrDecimals)} SKR`}
          />
          {premium.map((f) => (
            <Row key={f.id} label={`${f.name} filter (burned)`} value={`${f.priceSkr} SKR`} />
          ))}
          <Row
            label="Network fee"
            value={networkFee.data === undefined ? "–" : `~${networkFee.data.toFixed(3)} SOL`}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Button label={label} disabled={!ready || busy} onPress={start} />
        {problem && <Problem problem={problem} onRetry={start} />}
        {launchConfig.isError && (
          <Text style={styles.problem}>Couldn&apos;t reach the network. Check your connection.</Text>
        )}
      </View>

      {connecting && (
        <ConnectFlow
          onClose={() => {
            setConnecting(false);
            if (!useSession.getState().session) setPending(false);
          }}
          onBrowse={() => {
            setConnecting(false);
            setPending(false);
          }}
        />
      )}
      {toast}
    </KeyboardAvoidingView>
  );
}

function Problem({
  problem,
  onRetry,
}: {
  problem: NonNullable<ReturnType<typeof useLaunch>["problem"]>;
  onRetry: () => void;
}) {
  const action = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={styles.problemAction}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.problemRow} accessibilityLiveRegion="polite">
      {problem.kind === "skr" && (
        <>
          <Text style={styles.problem}>You need {problem.need} SKR to launch</Text>
          {action("Get SKR", () =>
            Alert.alert(
              "Get test SKR",
              "On devnet, test SKR comes from the Flicko team's faucet. Share your wallet address with us and we'll top you up.",
            ),
          )}
        </>
      )}
      {problem.kind === "sol" && (
        <>
          <Text style={styles.problem}>You need ~{problem.need} SOL for network fees</Text>
          {action("Get SOL", () => Linking.openURL("https://faucet.solana.com"))}
        </>
      )}
      {problem.kind === "failed" && (
        <>
          <Text style={styles.problem}>Launch failed. Nothing was charged.</Text>
          {action("Retry", onRetry)}
        </>
      )}
      {problem.kind === "unsafe" && (
        <Text style={styles.problem}>This photo can&apos;t be posted</Text>
      )}
      {problem.kind === "text" && <Text style={styles.problem}>{problem.text}</Text>}
    </View>
  );
}

function Segments({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.sub ? `${o.label}, ${o.sub}` : o.label}
            onPress={() => onChange(o.id)}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, selected && { color: colors.text }]}>{o.label}</Text>
            {o.sub && <Text style={styles.segmentSub}>{o.sub}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { height: 44, justifyContent: "center", alignItems: "center" },
  back: { position: "absolute", left: 20, top: 10 },
  title: { fontFamily: "DMSans_700Bold", fontSize: 16, color: colors.text },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 14 },
  thumb: {
    width: THUMB.width,
    height: THUMB.height,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  fieldBad: { borderColor: colors.loss },
  name: { height: 40, fontFamily: "DMSans_500Medium", fontSize: 15, color: colors.text },
  symbolField: { height: 32, flexDirection: "row", alignItems: "center", gap: 2 },
  dollar: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.textFaint },
  symbol: {
    flex: 1,
    padding: 0,
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: colors.text,
  },
  group: { gap: 8 },
  groupLabel: { fontFamily: "DMSans_500Medium", fontSize: 13, color: colors.textMuted },
  segments: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  segmentOn: { backgroundColor: ref.walletTile, borderColor: ref.lineDashed },
  segmentText: { fontFamily: "DMSans_700Bold", fontSize: 14, color: colors.textMuted },
  segmentSub: { fontFamily: "DMSans_400Regular", fontSize: 10, color: colors.textFaint },
  customRow: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: ref.lineDashed,
  },
  customInput: {
    flex: 1,
    padding: 0,
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: colors.text,
  },
  customSymbol: { fontFamily: "DMSans_400Regular", fontSize: 13, color: colors.textFaint },
  helper: { fontFamily: "DMSans_400Regular", fontSize: 12, color: colors.textFaint },
  bottom: { paddingHorizontal: 24, paddingTop: 12, gap: 10 },
  problemRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  problem: { fontFamily: "DMSans_500Medium", fontSize: 14, color: colors.text },
  problemAction: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: colors.text,
    textDecorationLine: "underline",
  },
});
