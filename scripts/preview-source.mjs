import {createHash} from "node:crypto";
import {existsSync, readFileSync, readdirSync} from "node:fs";
import {join, relative} from "node:path";
import ts from "typescript";

const inputs = ["index.circuit.tsx", "components", "imports", "lib", "models", "assets", "patches", "scripts",
  "manufacturing", "jlcpcb-clearance-rules.json",
  "package.json", "bun.lock", "tsconfig.json", "tscircuit.config.json", "tscircuit.config.ts"];

function literal(node) {
  if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return literal(node.expression);
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isStringLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator)) {
    const value = literal(node.operand);
    if (typeof value === "number") return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result = Object.create(null);
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || ![ts.SyntaxKind.Identifier, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NumericLiteral].includes(property.name.kind)) break;
      const key = property.name.text;
      if (Object.hasOwn(result, key)) throw new Error("Duplicate placement key");
      result[key] = literal(property.initializer);
    }
    if (Object.keys(result).length === node.properties.length) return result;
  }
  throw new Error("Placement preview requires literal coordinates");
}

export function parsePlacementSource(source) {
  const ast = ts.createSourceFile("index.circuit.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) return {source, placements: null};
  let declaration;
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    declaration = statement.declarationList.declarations.find(d => d.name.getText(ast) === "pcbGroupPlacements");
    if (declaration) break;
  }
  if (!declaration?.initializer) return {source, placements: null};
  try {
    const placements = literal(declaration.initializer);
    if (!placements || !Object.values(placements).every(p => Number.isFinite(p.pcbX) && Number.isFinite(p.pcbY))) {
      return {source, placements: null};
    }
    return {
      source: source.slice(0, declaration.initializer.getStart(ast)) + "PLACEMENT_MAP" + source.slice(declaration.initializer.end),
      placements,
    };
  } catch {
    // Expressions and unsupported syntax retain the ordinary full-build path.
    return {source, placements: null};
  }
}

export function placementLayoutKey(placements) {
  return JSON.stringify(Object.fromEntries(Object.entries(placements).map(([name, p]) => {
    const {pcbX, pcbY, ...layout} = p;
    return [name, layout];
  })));
}

export function readPreviewInput(projectDir) {
  const hash = createHash("sha256");
  let placements = null;
  const visit = path => {
    if (!existsSync(path)) return;
    const name = relative(projectDir, path);
    const entries = (() => { try { return readdirSync(path, {withFileTypes: true}); } catch { return null; } })();
    if (entries) {
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.name.startsWith(".")) visit(join(path, entry.name));
      }
      return;
    }
    let content = readFileSync(path);
    if (name === "index.circuit.tsx") {
      const parsed = parsePlacementSource(content.toString());
      placements = parsed.placements;
      content = Buffer.from(parsed.source);
    }
    hash.update(`${name.length}:${name}:${content.length}:`);
    hash.update(content);
  };
  for (const input of inputs) visit(join(projectDir, input));
  const sourceHash = hash.digest("hex");
  return {sourceHash, placements, inputKey: sourceHash + JSON.stringify(placements)};
}

export function canReusePlacement(cache, input) {
  return cache?.version === 1 && cache.translationOnly === true && input.placements !== null
    && cache.sourceHash === input.sourceHash
    && placementLayoutKey(cache.placements) === placementLayoutKey(input.placements)
    // Pours contain derived clearances around moved pads and holes. Translating
    // components alone cannot rebuild those plane openings.
    && !cache.circuitJson.some(e => ["pcb_trace", "pcb_via", "pcb_copper_pour"].includes(e.type));
}
