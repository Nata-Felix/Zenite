import type { NodeKind } from "../../../shared/types";
import { BackgroundPicker } from "../BackgroundPicker";
import { setCanvasPrefs, useCanvasPrefs } from "../../canvasPrefs";
import { NOTE_COLORS, setItemPrefs, useItemPrefs, type ItemSize, type ScreenMode } from "../../itemPrefs";
import { Choice, Section, SettingRow, Switch } from "./controls";
import { ConnectionEffects } from "./ConnectionEffects";

const KINDS: { kind: NodeKind; label: string }[] = [
  { kind: "terminal", label: "Terminal" },
  { kind: "note", label: "Nota" },
  { kind: "table", label: "Tabela" },
  { kind: "web", label: "Site" },
  { kind: "file", label: "Arquivo" },
  { kind: "folder", label: "Pasta" },
  { kind: "image", label: "Imagem" },
  { kind: "video", label: "Vídeo" },
];

const SIZES: { value: ItemSize; label: string }[] = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
];

export function CanvasAppearance() {
  const c = useCanvasPrefs();
  const items = useItemPrefs();
  return (
    <>
      <Section id="personalization-canvas" title="Fundo do canvas">
        <BackgroundPicker />
      </Section>
      <Section id="personalization-connections" title="Ligações">
        <SettingRow label="Estilo das linhas">
          <Choice
            label="Estilo das linhas"
            value={c.edge}
            onChange={(edge) => setCanvasPrefs({ edge })}
            options={[
              { value: "bezier", label: "Curva" },
              { value: "smooth", label: "Em ângulo, arredondada" },
              { value: "step", label: "Em ângulo" },
              { value: "straight", label: "Reta" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Animação em repouso" hint="Mantém o efeito entre os envios. O movimento de transmissão continua indicando mensagens.">
          <Switch label="Animação em repouso" checked={c.pulse} onChange={(pulse) => setCanvasPrefs({ pulse })} />
        </SettingRow>
        <ConnectionEffects />
      </Section>
      <Section id="personalization-items" title="Aparência dos itens novos">
        {KINDS.map((k) => (
          <SettingRow key={k.kind} label={k.label}>
            <Choice label={`Tamanho de ${k.label}`} value={items.sizes[k.kind] ?? "medium"} onChange={(v) => setItemPrefs({ sizes: { ...items.sizes, [k.kind]: v } })} options={SIZES} />
          </SettingRow>
        ))}
        <SettingRow label="Cor da nota nova">
          <Choice label="Cor da nota nova" value={items.noteColor} onChange={(noteColor) => setItemPrefs({ noteColor })} options={NOTE_COLORS.map((n) => ({ value: n.value, label: n.label }))} />
        </SettingRow>
        <SettingRow label="Nota nova já formatada (Markdown)">
          <Switch label="Nota nova formatada" checked={items.noteFormatted} onChange={(noteFormatted) => setItemPrefs({ noteFormatted })} />
        </SettingRow>
      </Section>
    </>
  );
}

export function CanvasTab() {
  const c = useCanvasPrefs();
  const items = useItemPrefs();
  return (
    <>
      <p className="settings-intro">Controles de navegação e tamanho da tela dos cartões. Para fundo, linhas e animações, use Personalização.</p>
      <Section title="Mouse">
        <SettingRow label="Ferramenta ao abrir" hint="Mão (H): arrastar o vazio com o esquerdo move a tela. Caixa de seleção (V): arrastar o vazio seleciona vários elementos. Só troca quando você aperta H ou V.">
          <Choice
            label="Ferramenta ao abrir"
            value={c.startTool}
            onChange={(startTool) => setCanvasPrefs({ startTool })}
            options={[
              { value: "hand", label: "Mão" },
              { value: "select", label: "Caixa de seleção" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Arrastar a tela com" hint="Na Caixa de seleção (V), o botão que move a tela. Na Mão (H), o esquerdo também move.">
          <Choice
            label="Arrastar a tela com"
            value={c.panButton}
            onChange={(panButton) => setCanvasPrefs({ panButton })}
            options={[
              { value: "space", label: "Espaço + arrastar (ou botão do meio)" },
              { value: "left", label: "Botão esquerdo (no vazio)" },
              { value: "middle", label: "Botão do meio" },
              { value: "right", label: "Botão direito" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Rodinha do mouse">
          <Choice
            label="Rodinha do mouse"
            value={c.wheel}
            onChange={(wheel) => setCanvasPrefs({ wheel })}
            options={[
              { value: "zoom", label: "Zoom" },
              { value: "pan", label: "Mover a tela (zoom com Ctrl)" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Focar o terminal ao passar o mouse" hint="O teclado vai para o terminal sob o mouse, sem precisar clicar.">
          <Switch label="Focar ao passar o mouse" checked={c.focusOnHover} onChange={(focusOnHover) => setCanvasPrefs({ focusOnHover })} />
        </SettingRow>
      </Section>
      <Section title="Tela dos cartões">
        <SettingRow
          label="Tamanho da tela"
          hint="Sites, terminais e demais cartões são desenhados como num monitor desse tamanho e reduzidos para caber no cartão: o site vê uma tela de verdade e o terminal ganha mais colunas. Cartão maior que a tela escolhida fica como está."
        >
          <Choice<ScreenMode>
            label="Tamanho da tela dos cartões"
            value={items.screen}
            onChange={(screen) => setItemPrefs({ screen })}
            options={[
              { value: "fit", label: "Ajustar ao cartão" },
              { value: "720p", label: "720p (1280 px)" },
              { value: "1080p", label: "1080p (1920 px)" },
            ]}
          />
        </SettingRow>
      </Section>
    </>
  );
}
