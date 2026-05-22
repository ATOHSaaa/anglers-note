#!/usr/bin/env python3
"""Competitor article scraper and content analyzer for SEO research."""

from __future__ import annotations

import json
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field, asdict
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import requests
from bs4 import BeautifulSoup, NavigableString, Tag

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.9"}
TIMEOUT = 20

# Fallback URLs if SERP fetch fails (manually verified candidates for マズメ釣り)
FALLBACK_URLS = [
    "https://umitokanpai.jp/mazume-fishing-time/",
    "https://web.tsuribito.co.jp/beginner/best-time-to-fishing-mazume",
    "https://fish-beginner.com/shorejigging-mazume",
    "https://sigabiyo-blog.com/morningeveningluretactics/",
    "https://ajidays.com/mazume/",
    "https://jiggingnavi.com/mazume-ajing/",
    "https://turisin.jp/post-3759/",
    "https://kurashi-no.jp/I0014928",
    "http://sakana.fukuoka.jp/mazume-147",
    "https://tsurihack.com/7024",
]

SKIP_DOMAINS = {
    "youtube.com",
    "www.youtube.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "facebook.com",
    "amazon.co.jp",
    "www.amazon.co.jp",
    "google.com",
    "www.google.com",
    "duckduckgo.com",
    "wikipedia.org",
    "ja.wikipedia.org",
}


def is_valid_result_url(url: str) -> bool:
    """Skip ads, redirectors, and non-article URLs."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if any(skip in domain for skip in SKIP_DOMAINS):
        return False
    if "aclick" in url or "y.js?" in url:
        return False
    return True


@dataclass
class ArticleData:
    url: str
    title: str = ""
    headings: list[dict] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    word_count: int = 0
    error: str | None = None


def fetch_html(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text
    except Exception as exc:  # noqa: BLE001
        print(f"  fetch error: {url} -> {exc}")
        return None


def search_duckduckgo(query: str, max_results: int = 15) -> list[str]:
    urls: list[str] = []
    try:
        resp = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.select("a.result__a"):
            href = a.get("href", "")
            if "uddg=" in href:
                parsed = parse_qs(urlparse(href).query)
                if "uddg" in parsed:
                    href = unquote(parsed["uddg"][0])
            if not href.startswith("http"):
                continue
            if not is_valid_result_url(href):
                continue
            if href not in urls:
                urls.append(href)
            if len(urls) >= max_results:
                break
    except Exception as exc:  # noqa: BLE001
        print(f"DuckDuckGo search failed: {exc}")
    return urls


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_main_content(soup: BeautifulSoup) -> Tag | None:
    for selector in [
        "article",
        "main",
        '[role="main"]',
        ".entry-content",
        ".post-content",
        ".article-body",
        ".single-content",
        "#content",
        ".content",
    ]:
        node = soup.select_one(selector)
        if node and len(node.get_text(strip=True)) > 300:
            return node

    # Fallback: largest text block among common containers
    candidates = soup.select("article, main, div.section, div.post, div.entry")
    best = None
    best_len = 0
    for node in candidates:
        length = len(node.get_text(strip=True))
        if length > best_len:
            best_len = length
            best = node
    return best or soup.body


def remove_noise(node: Tag) -> None:
    for tag in node.select(
        "script, style, nav, footer, header, aside, form, "
        ".sidebar, .widget, .related, .comments, .comment, "
        ".share, .sns, .breadcrumb, .toc, #toc, .advertisement, .ad"
    ):
        tag.decompose()


def scrape_article(url: str) -> ArticleData:
    data = ArticleData(url=url)
    html = fetch_html(url)
    if not html:
        data.error = "fetch_failed"
        return data

    soup = BeautifulSoup(html, "lxml")

    title_tag = soup.find("title")
    if title_tag:
        data.title = clean_text(title_tag.get_text())

    h1 = soup.find("h1")
    if h1:
        data.title = clean_text(h1.get_text()) or data.title

    content = extract_main_content(soup)
    if not content:
        data.error = "no_content"
        return data

    remove_noise(content)

    for level in range(1, 5):
        for h in content.find_all(f"h{level}"):
            text = clean_text(h.get_text())
            if text and len(text) >= 2:
                data.headings.append({"level": level, "text": text})

    seen = set()
    for p in content.find_all(["p", "li"]):
        text = clean_text(p.get_text())
        if len(text) < 20:
            continue
        if text in seen:
            continue
        seen.add(text)
        data.paragraphs.append(text)

    data.word_count = sum(len(p) for p in data.paragraphs)
    return data


# Topic patterns for Japanese fishing content analysis
TOPIC_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("マズメの定義・意味", re.compile(r"マズメ|まづめ|間詰|ゴールデンタイム|魔法の時間|昼と夜")),
    ("朝マズメの時間帯", re.compile(r"朝マズメ|朝まずめ|日の出|夜明け|早朝")),
    ("夕マズメの時間帯", re.compile(r"夕マズメ|夕まずめ|日没|日の入|夕方|黄昏")),
    ("季節別の時間", re.compile(r"春|夏|秋|冬|季節|シーズン")),
    ("釣れる理由（食物連鎖）", re.compile(r"食物連鎖|プランクトン|小魚|エサ")),
    ("釣れる理由（水温・代謝）", re.compile(r"水温|代謝|活性|酸素")),
    ("釣れる理由（光環境・視認性）", re.compile(r"薄明|シルエット|見え|視認|光")),
    ("釣れる理由（警戒心・人の少なさ）", re.compile(r"警戒|ストレス|人の|静か")),
    ("朝マズメ vs 夕マズメ比較", re.compile(r"朝.*夕|夕.*朝|どちら|比較|おすすめは朝")),
    ("潮・潮汐との関係", re.compile(r"潮|潮汐|大潮|中潮|小潮|満潮|干潮|潮目")),
    ("ルアー・色・タックル", re.compile(r"ルアー|ジグ|ワーム|色|グロー|チャート|タックル|ロッド|リール")),
    ("アクション・誘い方", re.compile(r"アクション|ジャーク|巻き|フォール|誘い|操作")),
    ("レンジ・水深", re.compile(r"レンジ|表層|中層|底|水深|カウント")),
    ("対象魚・釣り種", re.compile(r"シーバス|アジ|メバル|青物|ジギング|エギング|チニング|バス|根魚")),
    ("準備・持ち物", re.compile(r"準備|持ち物|リグ|チェック|装備")),
    ("注意点・例外", re.compile(r"注意|例外|必ずしも|保証|天候|雨|風")),
    ("潮汐表・ツール", re.compile(r"潮汐表|アプリ|日の出.*日の入|計算")),
    ("ポイント・場所選び", re.compile(r"ポイント|場所|堤防|岸|港湾|河口")),
]


def detect_topics(text: str) -> list[str]:
    return [name for name, pattern in TOPIC_PATTERNS if pattern.search(text)]


def normalize_heading(text: str) -> str:
    text = re.sub(r"[【】\[\]「」『』]", "", text)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[0-9０-９]+", "#", text)
    return text[:40]


def analyze_articles(articles: list[ArticleData]) -> dict:
    valid = [a for a in articles if not a.error and a.headings]
    topic_counts: Counter[str] = Counter()
    topic_by_url: dict[str, list[str]] = {}
    heading_counter: Counter[str] = Counter()
    heading_examples: dict[str, list[str]] = defaultdict(list)

    all_topics_sets: list[set[str]] = []

    for article in valid:
        full_text = "\n".join([article.title] + [h["text"] for h in article.headings] + article.paragraphs)
        topics = detect_topics(full_text)
        topic_by_url[article.url] = topics
        for t in set(topics):
            topic_counts[t] += 1
        all_topics_sets.append(set(topics))

        for h in article.headings:
            if h["level"] <= 2:
                norm = normalize_heading(h["text"])
                heading_counter[norm] += 1
                if len(heading_examples[norm]) < 3:
                    heading_examples[norm].append(h["text"])

    common_topics = [
        {
            "topic": topic,
            "count": count,
            "coverage": f"{count}/{len(valid)}",
            "priority": "必須" if count >= max(len(valid) - 1, 1) else "推奨" if count >= len(valid) // 2 else "任意",
        }
        for topic, count in topic_counts.most_common()
    ]

    # Topics appearing in only 1-2 articles = differentiation candidates
    rare_topics = [
        {"topic": t, "count": c, "found_in": [u for u, ts in topic_by_url.items() if t in ts]}
        for t, c in topic_counts.items()
        if c <= 2
    ]

    # Universal topics (in majority)
    if all_topics_sets:
        universal = set.intersection(*all_topics_sets) if len(all_topics_sets) > 1 else set()
    else:
        universal = set()

    common_headings = [
        {
            "normalized": norm,
            "count": count,
            "examples": heading_examples[norm],
        }
        for norm, count in heading_counter.most_common(20)
        if count >= 2
    ]

    return {
        "article_count": len(valid),
        "articles": [
            {
                "url": a.url,
                "title": a.title,
                "word_count": a.word_count,
                "heading_count": len(a.headings),
                "topics": topic_by_url.get(a.url, []),
                "headings": a.headings,
            }
            for a in valid
        ],
        "common_topics": common_topics,
        "universal_topics": sorted(universal),
        "rare_differentiation_topics": sorted(rare_topics, key=lambda x: x["count"]),
        "common_headings": common_headings,
        "failed": [{"url": a.url, "error": a.error} for a in articles if a.error],
    }


def main() -> None:
    import sys

    query = sys.argv[1] if len(sys.argv) > 1 else "マズメ"
    slug = sys.argv[2] if len(sys.argv) > 2 else "twilight-fishing"

    output_dir = Path(__file__).resolve().parent.parent / "content" / "articles" / slug
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Query: {query}")
    print(f"Output: {output_dir}")
    urls = search_duckduckgo(query, max_results=15)
    print(f"SERP URLs: {len(urls)}")

    # Merge with fallback, dedupe, take top 10
    merged: list[str] = []
    for u in urls + FALLBACK_URLS:
        if u not in merged:
            merged.append(u)
    target_urls = merged[:10]

    print(f"Scraping {len(target_urls)} articles...")
    articles: list[ArticleData] = []
    for i, url in enumerate(target_urls, 1):
        print(f"[{i}/{len(target_urls)}] {url}")
        articles.append(scrape_article(url))
        time.sleep(1.0)

    result = analyze_articles(articles)
    result["query"] = query
    result["slug"] = slug
    result["target_urls"] = target_urls

    json_path = output_dir / "research.json"
    json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved: {json_path}")

    # Print summary
    print("\n=== COMMON TOPICS ===")
    for item in result["common_topics"]:
        print(f"{item['priority']:4} {item['coverage']:5} {item['topic']}")

    print("\n=== RARE / DIFFERENTIATION ===")
    for item in result["rare_differentiation_topics"]:
        print(f"  {item['count']} articles: {item['topic']}")


if __name__ == "__main__":
    main()
