export type StackToolAction = 'install' | 'uninstall';
export type StackToolManager = 'node' | 'pip' | 'cargo' | 'go' | 'dotnet';

export interface StackToolDefinition {
  manager: StackToolManager;
  packages: string[];
  development?: boolean;
  detectedAs?: string[];
}

export interface StackToolResult {
  ok: boolean;
  action: StackToolAction;
  command: string;
  output: string;
}

export const STACK_TOOL_CATALOG: Record<string, Record<string, StackToolDefinition>> = {
  typescript: {
    React: { manager: 'node', packages: ['react', 'react-dom'], detectedAs: ['react'] },
    'Next.js': { manager: 'node', packages: ['next'], detectedAs: ['next'] },
    Angular: { manager: 'node', packages: ['@angular/core'] },
    NestJS: { manager: 'node', packages: ['@nestjs/core'] },
    Zod: { manager: 'node', packages: ['zod'] },
    Vitest: { manager: 'node', packages: ['vitest'], development: true },
    Prisma: { manager: 'node', packages: ['prisma'] },
    tRPC: { manager: 'node', packages: ['@trpc/server'] },
  },
  javascript: {
    React: { manager: 'node', packages: ['react', 'react-dom'], detectedAs: ['react'] },
    Vue: { manager: 'node', packages: ['vue'] },
    Svelte: { manager: 'node', packages: ['svelte'] },
    Express: { manager: 'node', packages: ['express'] },
    Vite: { manager: 'node', packages: ['vite'], development: true },
    Jest: { manager: 'node', packages: ['jest'], development: true },
    Axios: { manager: 'node', packages: ['axios'] },
    'Three.js': { manager: 'node', packages: ['three'] },
  },
  python: {
    Django: { manager: 'pip', packages: ['Django'], detectedAs: ['django'] },
    FastAPI: { manager: 'pip', packages: ['fastapi'] },
    Flask: { manager: 'pip', packages: ['Flask'], detectedAs: ['flask'] },
    NumPy: { manager: 'pip', packages: ['numpy'] },
    pandas: { manager: 'pip', packages: ['pandas'] },
    PyTorch: { manager: 'pip', packages: ['torch'] },
    pytest: { manager: 'pip', packages: ['pytest'] },
  },
  rust: {
    Axum: { manager: 'cargo', packages: ['axum'] },
    'Actix Web': { manager: 'cargo', packages: ['actix-web'] },
    Rocket: { manager: 'cargo', packages: ['rocket'] },
    Bevy: { manager: 'cargo', packages: ['bevy'] },
    Tokio: { manager: 'cargo', packages: ['tokio'] },
    Serde: { manager: 'cargo', packages: ['serde'] },
    Clap: { manager: 'cargo', packages: ['clap'] },
    Rayon: { manager: 'cargo', packages: ['rayon'] },
  },
  go: {
    Gin: { manager: 'go', packages: ['github.com/gin-gonic/gin'], detectedAs: ['gin'] },
    Fiber: { manager: 'go', packages: ['github.com/gofiber/fiber/v2'], detectedAs: ['fiber'] },
    Echo: { manager: 'go', packages: ['github.com/labstack/echo/v4'], detectedAs: ['echo'] },
    Cobra: { manager: 'go', packages: ['github.com/spf13/cobra'], detectedAs: ['cobra'] },
    GORM: { manager: 'go', packages: ['gorm.io/gorm'], detectedAs: ['gorm'] },
    Testify: { manager: 'go', packages: ['github.com/stretchr/testify'], detectedAs: ['testify'] },
    Zap: { manager: 'go', packages: ['go.uber.org/zap'], detectedAs: ['zap'] },
  },
  csharp: {
    'Entity Framework': { manager: 'dotnet', packages: ['Microsoft.EntityFrameworkCore'] },
    xUnit: { manager: 'dotnet', packages: ['xunit'], development: true },
    NUnit: { manager: 'dotnet', packages: ['NUnit'], development: true },
    Serilog: { manager: 'dotnet', packages: ['Serilog'] },
  },
};

export function stackToolDefinition(packId: string, name: string): StackToolDefinition | undefined {
  return STACK_TOOL_CATALOG[packId]?.[name];
}

export function stackToolKey(packId: string, name: string): string {
  return `${packId}:${name}`;
}

export function isStackToolInstalled(
  definition: StackToolDefinition,
  detectedPackages: string[]
): boolean {
  const detected = new Set(detectedPackages.map(normalizePackageName));
  const markers = definition.detectedAs ?? definition.packages;
  return markers.every((marker) => detected.has(normalizePackageName(marker)));
}

function normalizePackageName(name: string): string {
  return name.trim().toLocaleLowerCase().replaceAll('_', '-');
}
