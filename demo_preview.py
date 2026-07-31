"""
LightAgent Framework - Development Preview Demo
================================================
This script demonstrates the key features of LightAgent v0.9.6

Prerequisites:
- Set OPENAI_API_KEY, OPENAI_BASE_URL (or whichever provider)
- Or use the provider config below

Run: python demo_preview.py
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

# ============================================================
# 1. BASIC USAGE
# ============================================================
def demo_basic_agent():
    """Demonstrate basic LightAgent setup and usage"""
    print("\n" + "=" * 60)
    print("1. BASIC LIGHTAGENT SETUP")
    print("=" * 60)

    from LightAgent import LightAgent

    # Initialize with environment variables or direct values
    agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )

    print(f"Agent created: model={agent.model}")
    print(f"Version: {LightAgent.__version__}")
    print(f"Name: {agent.name}")
    print(f"Provider: {agent.provider}")
    return agent


# ============================================================
# 2. STREAMING
# ============================================================
def demo_streaming(agent):
    """Demonstrate streaming response capability"""
    print("\n" + "=" * 60)
    print("2. STREAMING RESPONSE")
    print("=" * 60)

    print("Streaming: 'Tell me about yourself in 2 sentences.'")
    try:
        stream = agent.run("Tell me about yourself in 2 sentences.", stream=True)
        print("Response: ", end="", flush=True)
        for chunk in stream:
            print(chunk, end="", flush=True)
        print()
    except Exception as e:
        print(f"[SKIP] Streaming requires valid API keys. Error: {e}")


# ============================================================
# 3. STRUCTURED RESULTS WITH TRACE
# ============================================================
def demo_structured_trace(agent):
    """Demonstrate structured results and trace observability"""
    print("\n" + "=" * 60)
    print("3. STRUCTURED RESULTS & TRACE")
    print("=" * 60)

    try:
        result = agent.run(
            "What is 2+2?",
            result_format="object",
            trace=True
        )
        print(f"Content: {result.content}")
        print(f"Trace ID: {result.trace_id}")
        print(f"Trace events: {len(result.trace)} events recorded")

        print("\nTrace summary:")
        for event in agent.export_trace():
            print(f"  - [{event['type']}] {str(event['data'])[:80]}...")
    except Exception as e:
        print(f"[SKIP] Trace demo requires valid API keys. Error: {e}")
    print()


# ============================================================
# 4. CUSTOM TOOLS
# ============================================================
def demo_tools():
    """Demonstrate custom tool integration"""
    print("\n" + "=" * 60)
    print("4. CUSTOM TOOL INTEGRATION")
    print("=" * 60)

    from LightAgent import LightAgent
    from datetime import datetime

    # Define a custom tool - uses LightAgent's tool_info format
    def get_current_time() -> str:
        """Get the current date and time."""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    setattr(get_current_time, "tool_info", {
        "tool_name": "get_current_time",
        "tool_description": "Get the current date and time",
        "tool_params": []
    })

    def calculate(operation: str, a: float, b: float) -> float:
        """Perform basic arithmetic operations."""
        if operation == "add":
            return a + b
        elif operation == "subtract":
            return a - b
        elif operation == "multiply":
            return a * b
        elif operation == "divide":
            return a / b if b != 0 else float("inf")
        return 0.0

    setattr(calculate, "tool_info", {
        "tool_name": "calculate",
        "tool_description": "Perform basic arithmetic operations",
        "tool_params": [
            {
                "name": "operation",
                "type": "string",
                "description": "The operation to perform (add, subtract, multiply, divide)",
                "required": True
            },
            {
                "name": "a",
                "type": "number",
                "description": "First number",
                "required": True
            },
            {
                "name": "b",
                "type": "number",
                "description": "Second number",
                "required": True
            }
        ]
    })

    agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        tools=[get_current_time, calculate]
    )

    print(f"Tools registered: {len(agent.tools)} custom tools")
    print(f"  - get_current_time: Get current date/time")
    print(f"  - calculate: Arithmetic operations (add, subtract, multiply, divide)")
    print()
    print("Example: 'What time is it and what is 25 * 4?'")
    try:
        result = agent.run("What time is it and what is 25 * 4?")
        print(f"Response: {result}")
    except Exception as e:
        print(f"[SKIP] Tool demo requires valid API keys. Error: {e}")
    print()


# ============================================================
# 5. MEMORY SUPPORT
# ============================================================
def demo_memory():
    """Demonstrate memory capabilities"""
    print("\n" + "=" * 60)
    print("5. MEMORY SUPPORT")
    print("=" * 60)

    from LightAgent import LightAgent, MemoryPolicy

    # Create agent with memory policy
    agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        memory_policy=MemoryPolicy(
            namespace="aurachat-demo",
            allowed_sources={"user", "assistant"},
        )
    )

    print("Memory policy configured:")
    print(f"  - Namespace: aurachat-demo")
    print(f"  - Allowed sources: user, assistant")
    print(f"  - Memory type: {type(agent.memory_policy).__name__}")
    print()


# ============================================================
# 6. GUARDRAILS
# ============================================================
def demo_guardrails():
    """Demonstrate guardrails (safety policies)"""
    print("\n" + "=" * 60)
    print("6. GUARDRAILS (SAFETY POLICIES)")
    print("=" * 60)

    from LightAgent import (
        LightAgent,
        privacy_input_guardrail,
        output_redaction_guardrail,
    )

    # Create agent with guardrails
    agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        input_guardrails=[privacy_input_guardrail()],
        output_guardrails=[output_redaction_guardrail()],
    )

    print("Guardrails configured:")
    print(f"  - Input guardrails: {len(agent.guardrails.input_guardrails)} guardrail(s)")
    print(f"  - Output guardrails: {len(agent.guardrails.output_guardrails)} guardrail(s)")
    print()


# ============================================================
# 7. LIGHTFLOW WORKFLOW
# ============================================================
def demo_lightflow():
    """Demonstrate LightFlow workflow orchestration"""
    print("\n" + "=" * 60)
    print("7. LIGHTFLOW WORKFLOW ORCHESTRATION")
    print("=" * 60)

    from LightAgent import LightAgent, LightFlow, JsonLightFlowStore

    agent1 = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )
    agent2 = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    )

    store = JsonLightFlowStore(".lightflow_runs")
    flow = (
        LightFlow(store=store)
        .step("research", agent=agent1, timeout=30, max_retry=2)
        .step("summarize", agent=agent2, depends_on=["research"])
    )

    print("LightFlow workflow defined:")
    print(f"  - Step 1: 'research' (agent1)")
    print(f"  - Step 2: 'summarize' (agent2, depends on research)")
    print(f"  - Store: {type(store).__name__}")
    print()


# ============================================================
# 8. LIGHTSWARM (MULTI-AGENT)
# ============================================================
def demo_lightswarm():
    """Demonstrate LightSwarm multi-agent collaboration"""
    print("\n" + "=" * 60)
    print("8. LIGHTSWARM MULTI-AGENT COLLABORATION")
    print("=" * 60)

    from LightAgent import LightAgent, LightSwarm

    # Create specialized agents
    sales_agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        name="SalesAgent",
        instructions="You are a sales expert. Handle sales and pricing inquiries.",
    )
    support_agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        name="SupportAgent",
        instructions="You are a technical support expert. Handle technical issues.",
    )

    # Create swarm and register agents
    swarm = LightSwarm()
    swarm.register_agent(sales_agent)
    swarm.register_agent(support_agent)

    print("LightSwarm created with 2 agents:")
    print(f"  - {sales_agent.name}: Sales expert")
    print(f"  - {support_agent.name}: Support expert")
    print(f"  - Total agents: {len(swarm.agents)}")
    print()


# ============================================================
# 9. EVALUATION HARNESS
# ============================================================
def demo_evaluation():
    """Demonstrate LightEvaluator for testing"""
    print("\n" + "=" * 60)
    print("9. EVALUATION HARNESS")
    print("=" * 60)

    from LightAgent import LightEvaluator, EvaluationCase

    # Create evaluation cases
    cases = [
        EvaluationCase(
            name="math_test",
            query="What is 2 + 2?",
            expected_output_contains=("4",),
        ),
        EvaluationCase(
            name="greeting_test",
            query="Hello!",
        ),
    ]

    evaluator = LightEvaluator()
    print(f"Evaluation harness ready:")
    print(f"  - Evaluator: {type(evaluator).__name__}")
    print(f"  - Test cases: {len(cases)}")
    for case in cases:
        print(f"    * {case.name}: '{case.query}'")
    print()


# ============================================================
# 10. RUNTIME HOOKS
# ============================================================
def demo_hooks():
    """Demonstrate runtime hooks middleware"""
    print("\n" + "=" * 60)
    print("10. RUNTIME HOOKS MIDDLEWARE")
    print("=" * 60)

    from LightAgent import LightAgent

    # Create a simple hook that logs model requests
    def log_model_request(ctx):
        if ctx.phase == "before_model_request":
            print(f"   [HOOK] Model request detected")
        return None

    agent = LightAgent(
        model=os.getenv("LLM_MODEL", "gpt-4.1"),
        api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        hooks=[log_model_request],
    )

    print("Runtime hooks configured:")
    print(f"  - Hook count: {len(agent.hooks.hooks)}")
    print()


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    print("=" * 58)
    print("  LightAgent v0.9.6 - Development Preview")
    print("  AuraChat Project")
    print("=" * 58)
    print()
    print("LightAgent is a lightweight Python framework for")
    print("OpenAI-compatible agents with tools, memory, guardrails,")
    print("tracing, lifecycle hooks, multi-agent collaboration,")
    print("and workflows.")
    print()
    print("Features preview:")

    # Run all demos (these just show setup, not actual API calls needing keys)
    demo_basic_agent()
    demo_tools()
    demo_memory()
    demo_guardrails()
    demo_lightflow()
    demo_lightswarm()
    demo_evaluation()
    demo_hooks()

    # These require valid API keys - will gracefully handle errors
    print("\n" + "=" * 60)
    print("ACTIVE API DEMOS (require valid API keys)")
    print("=" * 60)
    print("The following demos will attempt to call the LLM.")
    print("If API keys are not configured, they will gracefully skip.")
    print()

    from LightAgent import LightAgent

    agent = None
    try:
        agent = LightAgent(
            model=os.getenv("LLM_MODEL", "gpt-4.1"),
            api_key=os.getenv("OPENAI_API_KEY", "your-api-key-here"),
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        )
        demo_streaming(agent)
        demo_structured_trace(agent)
    except Exception as e:
        print(f"   [SKIP] API demos skipped: {e}")

    print()
    print("=" * 58)
    print("  Preview complete!")
    print()
    print("  To use with actual API keys:")
    print("  1. Create a .env file with:")
    print("     OPENAI_API_KEY=your-key")
    print("     OPENAI_BASE_URL=https://api.openai.com/v1")
    print()
    print("  2. Activate venv: source .venv/bin/activate")
    print("  3. Run: python demo_preview.py")
    print("=" * 58)