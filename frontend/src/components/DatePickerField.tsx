import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Modal } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { theme, type } from "@/src/theme";
import { formatDate } from "@/src/utils/date";

type Props = {
  value: string | null; // YYYY-MM-DD
  onChange: (isoDate: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
};

function parseIsoDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Calendar date picker — use this anywhere the app needs a date.
 * Stores/returns ISO YYYY-MM-DD; displays DD/MM/YYYY.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  minimumDate,
  maximumDate,
  testID = "date-picker",
}: Props) {
  const selected = useMemo(() => parseIsoDate(value) || new Date(), [value]);
  const [open, setOpen] = useState(false);

  const apply = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed") {
      setOpen(false);
      return;
    }
    if (date) onChange(toIsoDate(date));
  };

  return (
    <View>
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.brand} />
        <Text style={[styles.fieldTxt, !value && styles.placeholder]}>
          {value ? formatDate(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.textDim} />
      </Pressable>

      {open && Platform.OS === "android" && (
        <DateTimePicker
          value={selected}
          mode="date"
          display="calendar"
          onChange={apply}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Select date</Text>
                <Pressable testID={`${testID}-done`} onPress={() => setOpen(false)} style={styles.doneBtn}>
                  <Text style={styles.doneTxt}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={selected}
                mode="date"
                display="inline"
                onChange={apply}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant="dark"
                style={{ alignSelf: "center" }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {Platform.OS === "web" && open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Select date</Text>
                <Pressable onPress={() => setOpen(false)} style={styles.doneBtn}>
                  <Text style={styles.doneTxt}>Done</Text>
                </Pressable>
              </View>
              {/* @ts-expect-error web-only native input */}
              <input
                type="date"
                value={value || ""}
                min={minimumDate ? toIsoDate(minimumDate) : undefined}
                max={maximumDate ? toIsoDate(maximumDate) : undefined}
                onChange={(e: any) => {
                  if (e?.target?.value) onChange(e.target.value);
                }}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.bg,
                  color: theme.text,
                  fontSize: 16,
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.bg2,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldTxt: { ...type.bodySm, color: theme.text, flex: 1 },
  placeholder: { color: theme.textDim },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.bg2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sheetTitle: { ...type.titleMd, color: theme.text, fontWeight: "700" },
  doneBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill, backgroundColor: theme.brandTint },
  doneTxt: { ...type.caption, color: theme.brand, fontWeight: "700" },
});
