"""Core Tools factory -- returns all tools for the Agent."""

from pathlib import Path
from typing import List, Union

from langchain_core.tools import BaseTool

from .python_repl_tool import create_python_repl_tool
from .read_file_tool import create_read_file_tool, create_read_skill_tool
from .terminal_tool import create_terminal_tool
from .write_memory_tool import create_write_memory_tool
from .rich_file_tool import create_rich_file_tool
from .web_search_tool import create_web_search_tool, create_web_fetch_tool
from .ssh_tool import create_ssh_tools


def get_all_tools(base_dir: Union[Path, str]) -> List[BaseTool]:
    """Create and return all tools, sandboxed to base_dir."""
    base_dir = Path(base_dir) if isinstance(base_dir, str) else base_dir
    memory_dir = base_dir / "memory"
    skills_dir = base_dir / "skills"
    tools = [
        create_terminal_tool(base_dir),
        create_python_repl_tool(),
        create_read_file_tool(base_dir),
        create_read_skill_tool(skills_dir),
        create_write_memory_tool(memory_dir),
        create_rich_file_tool(base_dir),
        create_web_search_tool(),
        create_web_fetch_tool(),
    ]
    tools.extend(create_ssh_tools())
    return tools
