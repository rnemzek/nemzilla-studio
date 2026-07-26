import { For, Match, Switch } from 'solid-js'
import type { EnrichmentCard } from '../lib/poInterview.ts'

/**
 * Phase 2: renders the structured EnrichmentCard the AI PO's enrichment
 * tools return (poInterviewLLM.ts / enrichmentTools.ts) as an actual visual
 * card inside the AgentZ terminal, instead of the PO's reply text being the
 * only place that data shows up.
 */
export default function EnrichmentCardView(props: { card: EnrichmentCard }) {
  return (
    <div class="my-1.5 max-w-md rounded-lg border border-accent/30 bg-surface-raised p-3 text-xs not-italic">
      <Switch>
        <Match when={props.card.type === 'recipe' ? props.card : undefined}>
          {(card) => (
            <div>
              <p class="font-semibold text-text">
                🍽️ {card().title} <span class="font-normal text-text-muted">· serves {card().servings} · ~{card().prepTimeMinutes} min</span>
              </p>
              <p class="mt-2 font-medium text-accent">Ingredients</p>
              <ul class="mt-0.5 list-disc space-y-0.5 pl-4 text-text-muted">
                <For each={card().ingredients}>{(ing) => <li>{ing.quantity} {ing.name}</li>}</For>
              </ul>
              <p class="mt-2 font-medium text-accent">Steps</p>
              <ol class="mt-0.5 list-decimal space-y-0.5 pl-4 text-text-muted">
                <For each={card().steps}>{(step) => <li>{step}</li>}</For>
              </ol>
            </div>
          )}
        </Match>
        <Match when={props.card.type === 'sports' ? props.card : undefined}>
          {(card) => (
            <div>
              <p class="font-semibold text-text">🏟️ {card().team} — upcoming games</p>
              <div class="mt-1.5 space-y-1.5">
                <For each={card().games}>
                  {(game) => (
                    <div class="rounded border border-border/60 px-2 py-1">
                      <p class="text-text">
                        vs {game.opponent} <span class="text-text-muted">· {game.date} · {game.time}</span>
                      </p>
                      <p class="text-text-muted">
                        {game.venue} · 📺 {game.broadcast} ·{' '}
                        <a href={game.streamUrl} target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">
                          stream
                        </a>
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </Match>
        <Match when={props.card.type === 'grocery' ? props.card : undefined}>
          {(card) => (
            <div>
              <p class="font-semibold text-text">🛒 {card().item} — price comparison</p>
              <div class="mt-1.5 space-y-0.5">
                <For each={[...card().stores].sort((a, b) => a.price - b.price)}>
                  {(store) => (
                    <div class="flex items-center justify-between">
                      <span class={store.name === card().cheapest ? 'font-medium text-emerald-400' : 'text-text-muted'}>
                        {store.name === card().cheapest ? '✓ ' : ''}
                        {store.name}
                      </span>
                      <span class={store.name === card().cheapest ? 'font-medium text-emerald-400' : 'text-text-muted'}>
                        ${store.price.toFixed(2)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </Match>
      </Switch>
    </div>
  )
}
