import { MEME_DECIMALS } from "@flicko/sdk";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
import {
  compact,
  formatUnits,
  groupDigits,
  parseUnits,
} from "@/features/create/format";
import { LaunchSummary } from "@/features/create/launch-summary";
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
import { api } from "@/lib/api";
import { geist } from "@/theme";

/*
 * 4 · Launch (design-reference/CreateFlow.html): name and $symbol (prefilled from the
 * caption), total supply (presets or custom 1M-10B), starting price, a live summary
 * from the SDK's launch math, the fees, and "Launch for {total} SKR".
 */
const MIN_SUPPLY = 1e6;
const MAX_SUPPLY = 1e10;
const THUMB = { width: 76, height: 96 };
const LINE = "#2A2833";

const STEP_LABEL: Record<Exclude<LaunchStep, "idle">, string> = {
  preparing: "Launching…",
  wallet: "Launching…",
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
  const { step, problem, launch, clearProblem } = useLaunch(() =>
    show("Launch cancelled"),
  );
  const [customText, setCustomText] = useState(
    supplyMode === "custom" ? groupDigits(String(supply)) : "",
  );
  const [supplyError, setSupplyError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = step !== "idle";
  const { width } = useWindowDimensions();
  const [focus, setFocus] = useState<string | null>(null);
  const [ticker, setTicker] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");

  // Is the ticker still free? Checked 300ms after the last keystroke.
  useEffect(() => {
    if (!symbol) {
      setTicker("idle");
      return;
    }
    setTicker("checking");
    let live = true;
    const timer = setTimeout(() => {
      api<{ available: boolean }>(`/symbols/${symbol}`)
        .then((r) => live && setTicker(r.available ? "available" : "taken"))
        .catch(() => live && setTicker("available"));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [symbol]);

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
  const minSupply = Math.max(
    MIN_SUPPLY,
    cfg ? Number(cfg.minSupply) / unit : 0,
  );
  const maxSupply = Math.min(
    MAX_SUPPLY,
    cfg ? Number(cfg.maxSupply) / unit : MAX_SUPPLY,
  );
  const supplyOk =
    supply >= minSupply && supply <= maxSupply && Number.isInteger(supply);
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
    !!scene &&
    nameOk &&
    symbolOk &&
    ticker === "available" &&
    supplyOk &&
    total !== null &&
    networkFee.data !== undefined;

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

  const label = busy ? "Launching…" : symbol ? `Launch $${symbol}` : "Launch";

  // The whole photo, never cropped, fitted inside a small frame.
  const thumb = scene ? fitIn(sceneAspect(scene), THUMB) : THUMB;
  const input = (key: string, bad = false) => [
    styles.input,
    focus === key && styles.inputFocus,
    bad && styles.inputBad,
  ];

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { paddingTop: insets.top }]}
    >
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
          Launch meme
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <View style={styles.thumb}>
            {scene && (
              <SceneCanvas
                scene={scene}
                assets={assets}
                width={thumb.width}
                height={thumb.height}
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <View>
              <Label left="Name" right={`${name.length}/32`} />
              <TextInput
                value={name}
                onChangeText={(text) => setName(text.slice(0, 32))}
                onFocus={() => setFocus("name")}
                onBlur={() => setFocus(null)}
                placeholder="Name your meme"
                placeholderTextColor="#6F6B7C"
                maxLength={32}
                editable={!busy}
                accessibilityLabel="Name"
                style={[
                  ...input("name", !nameOk && name.length > 0),
                  styles.name,
                ]}
              />
            </View>
            <View>
              <Label
                left="Ticker"
                right={
                  ticker === "available"
                    ? "Available"
                    : ticker === "taken"
                      ? "Taken"
                      : ticker === "checking"
                        ? "Checking…"
                        : ""
                }
                rightColor={
                  ticker === "available"
                    ? "#C8FF4D"
                    : ticker === "taken"
                      ? "#FF6B7A"
                      : "#9C98A8"
                }
              />
              <View
                style={[
                  ...input("symbol", ticker === "taken"),
                  styles.symbolField,
                ]}
              >
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  value={symbol}
                  onChangeText={(text) =>
                    setSymbol(
                      text
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 10),
                    )
                  }
                  onFocus={() => setFocus("symbol")}
                  onBlur={() => setFocus(null)}
                  placeholder="TICKER"
                  placeholderTextColor="#6F6B7C"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                  editable={!busy}
                  accessibilityLabel="Ticker"
                  style={styles.symbol}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.group, { marginTop: 20 }]}>
          <Label left="Total supply" right="Can’t be changed later" />
          <Segments
            height={40}
            disabled={busy}
            options={[
              ...SUPPLY_PRESETS.map((n) => ({
                id: String(n),
                label: compact(n),
              })),
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
              <View
                style={[...input("custom", !!supplyError), styles.customRow]}
              >
                <TextInput
                  value={customText}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, "").slice(0, 11);
                    setCustomText(groupDigits(digits));
                    setSupply(Number(digits) || 0, "custom");
                  }}
                  onFocus={() => setFocus("custom")}
                  onBlur={() => {
                    setFocus(null);
                    checkCustom();
                  }}
                  editable={!busy}
                  keyboardType="number-pad"
                  placeholder="Enter supply, e.g. 420,000,000"
                  placeholderTextColor="#6F6B7C"
                  accessibilityLabel="Custom supply"
                  style={styles.customInput}
                />
              </View>
              {supplyError && <Text style={styles.error}>{supplyError}</Text>}
            </>
          )}
        </View>

        <View style={[styles.group, { marginTop: 16 }]}>
          <Label left="Starting price" right="SKR per token" />
          <Segments
            height={52}
            disabled={busy}
            options={(Object.keys(PRICE_TIERS) as PriceTier[]).map((id) => ({
              id,
              label: PRICE_TIERS[id].label,
              sub: PRICE_TIERS[id].skr,
            }))}
            value={price}
            onChange={(id) => setPrice(id as PriceTier)}
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <LaunchSummary
            width={width - 32}
            supply={supplyRaw}
            startPrice={startPrice}
            symbol={symbol}
            skrDecimals={config.skrDecimals}
            creatorFeeBps={cfg?.creatorFeeBps}
            networkFee={networkFee.data}
            creationFee={creationFee}
            burned={premium.map((f) => ({
              label: `${f.name} filter`,
              skr: f.priceSkr ?? 0,
            }))}
          />
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {problem && <Problem problem={problem} onRetry={start} />}
        {launchConfig.isError && (
          <Text style={styles.problem}>
            Couldn&apos;t reach the network. Check your connection.
          </Text>
        )}
        <Button
          label={label}
          disabled={!ready || busy}
          onPress={start}
          icon={
            busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : undefined
          }
        />
        <Text style={styles.confirm}>You’ll confirm in your wallet</Text>
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

function Label({
  left,
  right,
  rightColor = "#9C98A8",
}: {
  left: string;
  right?: string;
  rightColor?: string;
}) {
  return (
    <View style={styles.label}>
      <Text style={styles.labelText}>{left}</Text>
      {!!right && (
        <Text style={[styles.labelText, { color: rightColor }]}>{right}</Text>
      )}
    </View>
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
          <Text style={styles.problem}>
            You need {problem.need} SKR to launch
          </Text>
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
          <Text style={styles.problem}>
            You need ~{problem.need} SOL for network fees
          </Text>
          {action("Get SOL", () =>
            Linking.openURL("https://faucet.solana.com"),
          )}
        </>
      )}
      {problem.kind === "failed" && (
        <>
          <Text style={styles.problem}>
            Launch failed. Nothing was charged.
          </Text>
          {action("Retry", onRetry)}
        </>
      )}
      {problem.kind === "unsafe" && (
        <Text style={styles.problem}>This photo can&apos;t be posted</Text>
      )}
      {problem.kind === "text" && (
        <Text style={styles.problem}>{problem.text}</Text>
      )}
    </View>
  );
}

function Segments({
  options,
  value,
  onChange,
  height,
  disabled,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string;
  onChange: (id: string) => void;
  height: number;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.segments, { height }]} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={o.sub ? `${o.label}, ${o.sub}` : o.label}
            disabled={disabled}
            onPress={() => onChange(o.id)}
            style={[
              styles.segment,
              i > 0 && { borderLeftWidth: 1, borderLeftColor: LINE },
              selected && { backgroundColor: "#F5F3F7" },
            ]}
          >
            <Text
              style={[
                o.sub ? styles.tierName : styles.segmentText,
                { color: selected ? "#0B0B0F" : o.sub ? "#F5F3F7" : "#B9B5C4" },
              ]}
            >
              {o.label}
            </Text>
            {o.sub && (
              <Text
                style={[
                  styles.tierValue,
                  { color: selected ? "#3A3744" : "#9C98A8" },
                ]}
              >
                {o.sub}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const NUM = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B0F" },
  top: { height: 52, justifyContent: "center", alignItems: "center" },
  back: {
    position: "absolute",
    left: 0,
    top: 4,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: geist.semibold, fontSize: 16, color: "#F5F3F7" },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    top: 6,
    width: THUMB.width,
    height: THUMB.height,
    backgroundColor: "#000000",
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: LINE,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  labelText: {
    fontFamily: geist.regular,
    fontSize: 12,
    color: "#9C98A8",
    ...NUM,
  },
  input: {
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 12,
  },
  inputFocus: { borderColor: "#B9B5C4" },
  inputBad: { borderColor: "#FF6B7A" },
  name: {
    fontFamily: geist.regular,
    fontSize: 15,
    color: "#F5F3F7",
    paddingVertical: 0,
  },
  symbolField: { flexDirection: "row", alignItems: "center", gap: 4 },
  dollar: { fontFamily: geist.regular, fontSize: 15, color: "#9C98A8" },
  symbol: {
    flex: 1,
    padding: 0,
    fontFamily: geist.regular,
    fontSize: 15,
    color: "#F5F3F7",
  },
  group: { gap: 0 },
  segments: {
    flexDirection: "row",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: LINE,
    overflow: "hidden",
  },
  segment: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentText: { fontFamily: geist.medium, fontSize: 14, ...NUM },
  tierName: { fontFamily: geist.semibold, fontSize: 14 },
  tierValue: { fontFamily: geist.regular, fontSize: 12, ...NUM },
  customRow: { marginTop: 8, justifyContent: "center" },
  customInput: {
    padding: 0,
    fontFamily: geist.regular,
    fontSize: 15,
    color: "#F5F3F7",
    ...NUM,
  },
  error: {
    marginTop: 6,
    fontFamily: geist.regular,
    fontSize: 12,
    color: "#FF6B7A",
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#1F1D26",
    backgroundColor: "#0B0B0F",
  },
  confirm: {
    textAlign: "center",
    fontFamily: geist.regular,
    fontSize: 12,
    color: "#9C98A8",
  },
  problemRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  problem: { fontFamily: geist.medium, fontSize: 14, color: "#F5F3F7" },
  problemAction: {
    fontFamily: geist.medium,
    fontSize: 14,
    color: "#F5F3F7",
    textDecorationLine: "underline",
  },
});
