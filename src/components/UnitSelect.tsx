import type { Units } from "@/maps/schema";
import { legacyText } from "@/oslo/legacy-i18n";

import { Select } from "./ui/select";

export const UnitSelect = ({
    unit,
    onChange,
    disabled,
}: {
    unit: Units;
    onChange: (unit: Units) => void;
    disabled?: boolean;
}) => {
    return (
        <Select
            trigger={legacyText("Unit")}
            options={{
                miles: "Miles",
                kilometers: "Kilometers",
                meters: "Meters",
            }}
            disabled={disabled}
            value={unit}
            onValueChange={onChange}
        />
    );
};
