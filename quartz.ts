import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import type { Root } from "mdast"
import type { VFile } from "vfile"
import type { QuartzComponentProps } from "./quartz/components/types"
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const execFileAsync = promisify(execFile)
const config = await loadQuartzConfig()

// Initial publication follows the file's current Git history, including renames.
config.plugins.transformers.push({
  name: "InitialPublicationDate",
  markdownPlugins(ctx) {
    return [
      () => {
        const repositoryRoot = execFileAsync("git", ["rev-parse", "--show-toplevel"], {
          cwd: path.resolve(ctx.argv.directory),
          encoding: "utf8",
          windowsHide: true,
        })
          .then(({ stdout }) => stdout.trim())
          .catch(() => undefined)

        return async (_tree: Root, file: VFile) => {
          const dates = file.data.dates
          if (!dates || file.data.frontmatter?.published) return

          dates.published = dates.created
          const workdir = await repositoryRoot
          if (!workdir || !file.data.filePath) return

          const relativePath = path.relative(workdir, file.data.filePath).split(path.sep).join("/")
          try {
            const { stdout } = await execFileAsync(
              "git",
              [
                "--literal-pathspecs",
                "log",
                "--follow",
                "--diff-filter=A",
                "-1",
                "--format=%cI",
                "--",
                relativePath,
              ],
              { cwd: workdir, encoding: "utf8", windowsHide: true },
            )
            if (stdout.trim()) dates.published = new Date(stdout.trim())
          } catch (error) {
            console.warn(`Could not read initial publication date for ${relativePath}:`, error)
          }
        }
      },
    ]
  },
})

const configuredLayout = await loadQuartzLayout()
export const layout = await loadQuartzLayout({
  defaults: {
    right: (configuredLayout.defaults.right ?? []).map((component) => {
      if (component.name !== "RecentNotes") return component

      return Object.assign(
        (props: QuartzComponentProps) =>
          component({
            ...props,
            allFiles: props.allFiles.map((page) => ({ ...page, defaultDateType: "published" })),
          }),
        component,
      )
    }),
  },
})

export default config
