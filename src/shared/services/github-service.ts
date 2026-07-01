interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  assets: GitHubAsset[];
}

export interface DictionaryReleaseInfo {
  version: string;
  downloadUrl: string;
  fileName: string;
  size: number;
  publishedAt: string;
}

const GITHUB_REPO_OWNER = "ahpxex";
const GITHUB_REPO_NAME = "open-dictionary";
const EN_ZH_DICTIONARY_FILE_NAME = "open-english-dictionary.zip";
const ZH_EN_DICTIONARY_FILE_NAME = "open-chinese-dictionary.zip";

/**
 * Fetches the latest release information from the GitHub repository for a given dictionary type.
 */
export async function getLatestDictionaryRelease(
  dictType: "en-zh" | "zh-en" = "en-zh"
): Promise<DictionaryReleaseInfo> {
  const fileName = dictType === "zh-en" ? ZH_EN_DICTIONARY_FILE_NAME : EN_ZH_DICTIONARY_FILE_NAME;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`
    );

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const release: GitHubRelease = await response.json();

    // Find the dictionary file asset
    const asset = release.assets.find(
      (asset) => asset.name === fileName
    );

    if (!asset) {
      throw new Error(`Asset '${fileName}' not found in latest release`);
    }

    return {
      version: release.tag_name,
      downloadUrl: asset.browser_download_url,
      fileName: asset.name,
      size: asset.size,
      publishedAt: release.published_at,
    };
  } catch (error) {
    console.error("Failed to fetch dictionary release:", error);
    throw error;
  }
}

/**
 * Fetches all releases from the GitHub repository
 */
export async function getAllDictionaryReleases(): Promise<DictionaryReleaseInfo[]> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`
    );

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const releases: GitHubRelease[] = await response.json();

    return releases.flatMap((release) =>
      release.assets
        .filter(
          (asset) =>
            asset.name === EN_ZH_DICTIONARY_FILE_NAME ||
            asset.name === ZH_EN_DICTIONARY_FILE_NAME
        )
        .map((asset) => ({
          version: release.tag_name,
          downloadUrl: asset.browser_download_url,
          fileName: asset.name,
          size: asset.size,
          publishedAt: release.published_at,
        }))
    );
  } catch (error) {
    console.error("Failed to fetch all dictionary releases:", error);
    throw error;
  }
}