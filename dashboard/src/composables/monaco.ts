import { defineAsyncComponent } from 'vue'

export const VueMonacoEditor = defineAsyncComponent(async () => {
  const [{ VueMonacoEditor: component, loader }, monaco, { default: EditorWorker }, { default: JsonWorker }] =
    await Promise.all([
      import('@guolao/vue-monaco-editor'),
      import('monaco-editor/esm/vs/editor/editor.api'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker'),
      import('monaco-editor/esm/vs/language/json/json.worker?worker')
    ])
  // editor.api provides the API; standard navigation, selection, clipboard and
  // find commands are registered by editor.all before an editor is created.
  await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.all'),
    import('monaco-editor/esm/vs/language/json/monaco.contribution'),
    import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution')
  ])
  window.MonacoEnvironment = {
    getWorker(_id, label) {
      if (label === 'json') {
        return new JsonWorker()
      }
      return new EditorWorker()
    }
  }
  loader.config({ monaco })
  return component
})
