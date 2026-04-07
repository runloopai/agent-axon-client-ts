// @ts-check
/**
 * TypeDoc plugin that assigns a default @category to uncategorized
 * reflections based on their parent module.
 *
 * TypeDoc's `defaultCategory` is global, but our ACP and Claude modules
 * each wildcard-re-export an upstream package. Without this plugin those
 * types all land in "Other". This plugin tags them with the correct
 * per-module category before the CategoryPlugin runs.
 */
import { Comment, CommentTag, Converter, ReflectionKind } from "typedoc";

const MODULE_DEFAULT_CATEGORIES = {
  acp: "ACP Protocol",
  claude: "Claude SDK",
};

/** @param {import("typedoc").Application} app */
export function load(app) {
  app.converter.on(
    Converter.EVENT_RESOLVE_BEGIN,
    /** @param {import("typedoc").Context} context */
    (context) => {
      for (const reflection of context.project.getReflectionsByKind(
        ReflectionKind.All,
      )) {
        if (reflection.comment?.getTag("@category")) continue;

        let parent = reflection.parent;
        while (parent && parent.kind !== ReflectionKind.Module) {
          parent = parent.parent;
        }
        if (!parent) continue;

        const defaultCategory = MODULE_DEFAULT_CATEGORIES[parent.name];
        if (!defaultCategory) continue;

        if (!reflection.comment) {
          reflection.comment = new Comment();
        }
        reflection.comment.blockTags.push(
          new CommentTag("@category", [
            { kind: "text", text: defaultCategory },
          ]),
        );
      }
    },
  );
}
