import { View } from "react-native";
import { AppText, Icon, stitchTokens } from "../../core/ui";
import { driverStyles as styles } from "./driver-styles";

export interface DriverMilestone {
  label: string;
  detail?: string | null;
  done: boolean;
}

export function formatDriverTime(iso?: string | null) {
  return iso ? new Date(iso).toLocaleString("vi-VN") : null;
}

export function DriverMilestones({ items }: { items: DriverMilestone[] }) {
  return (
    <View style={styles.milestoneList} accessibilityRole="list">
      {items.map((m, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <View
            key={m.label}
            style={styles.milestoneRow}
            accessible
            accessibilityLabel={`${m.label}${m.done ? ", đã xong" : ", chưa tới"}${m.detail ? `, ${m.detail}` : ""}`}
          >
            <View style={styles.milestoneTrack}>
              <View style={[styles.milestoneDot, m.done && styles.milestoneDotDone]}>
                {m.done ? <Icon name="check" size={10} color={stitchTokens.white} /> : null}
              </View>
              {!isLast ? (
                <View style={[styles.milestoneLine, m.done && styles.milestoneLineDone]} />
              ) : null}
            </View>
            <View style={styles.milestoneBody}>
              <AppText style={[styles.milestoneLabel, m.done && styles.milestoneLabelDone]}>
                {m.label}
              </AppText>
              {m.detail ? <AppText style={styles.milestoneDetail}>{m.detail}</AppText> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
