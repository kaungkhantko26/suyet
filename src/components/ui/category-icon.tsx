import { Blocks, Bot, Brain, Cloud, Code, Cpu, Database, Flag, GraduationCap, Gamepad2, Globe, Lightbulb, Mic, Palette, Rocket, School, Server, Shield, Smartphone, Sparkles, Trophy, Users, Wrench, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy, code: Code, brain: Brain, cpu: Cpu, database: Database, shield: Shield, flag: Flag, globe: Globe,
  smartphone: Smartphone, palette: Palette, "gamepad-2": Gamepad2, bot: Bot, cloud: Cloud, server: Server, blocks: Blocks,
  rocket: Rocket, lightbulb: Lightbulb, wrench: Wrench, "graduation-cap": GraduationCap, mic: Mic, users: Users, school: School,
};
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" />;
}
export const iconNames = Object.keys(ICONS);
