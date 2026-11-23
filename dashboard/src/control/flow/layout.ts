import { graphlib, layout } from '@dagrejs/dagre'
import { Position, MarkerType, type Node, type Edge } from '@vue-flow/core'
import type { FlowView, FlowStage } from '@core/control/contracts'

export interface StageData {
  stage: FlowStage
  registrations: FlowView['registrations']
  selected: boolean
}
export function flowLayout(view: FlowView, selected: string) {
  const graph = new graphlib.Graph()
  graph.setGraph({ rankdir: 'LR', ranksep: 52, nodesep: 36, marginx: 28, marginy: 36 })
  graph.setDefaultEdgeLabel(() => {
    return {}
  })
  for (const stage of view.stages) {
    graph.setNode(stage.id, { width: 222, height: 154 })
  }
  for (const edge of view.edges) {
    graph.setEdge(edge.source, edge.target)
  }
  layout(graph)
  const nodes: Node<StageData>[] = view.stages.map((stage) => {
    const point = graph.node(stage.id)
    return {
      id: stage.id,
      type: 'stage',
      position: { x: point.x - 111, y: point.y - 77 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        stage,
        selected: selected === stage.id,
        registrations: view.registrations
          .filter((item) => {
            return item.pointId === stage.id
          })
          .sort((a, b) => {
            return a.rank - b.rank
          })
      }
    }
  })
  const edges: Edge[] = view.edges.map((edge) => {
    return {
      ...edge,
      id: edge.source + ':' + edge.target,
      type: 'smoothstep',
      markerEnd: MarkerType.ArrowClosed,
      style: { stroke: 'rgb(var(--pi-primary))', strokeWidth: 1.8 },
      labelStyle: { fill: 'rgb(var(--pi-on-surface))', fontSize: 15 },
      labelBgStyle: { fill: 'rgb(var(--pi-surface))' }
    }
  })
  return { nodes, edges }
}
