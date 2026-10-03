import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { money } from "@/lib/format";
import { tooltipStyle } from "./shared";

export type DonutSlice = { name: string; value: number; color: string };

export default function DonutChart({
  data,
  innerRadius,
  outerRadius,
  styledTooltip = true,
}: {
  data: DonutSlice[];
  innerRadius: number;
  outerRadius: number;
  styledTooltip?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
        >
          {data.map((c, i) => (
            <Cell key={i} fill={c.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => money(v)}
          contentStyle={styledTooltip ? tooltipStyle : undefined}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
