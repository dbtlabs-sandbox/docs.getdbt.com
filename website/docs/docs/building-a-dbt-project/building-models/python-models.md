---
title: "Python models"
---

:::info Beta

This feature is arriving in dbt Core v1.3, which is currently in beta. We encourage you to join us in the #beta-feedback-python-models channel in the dbt Community Slack.

:::

## Why Python?

TODO

https://github.com/dbt-labs/dbt-core/discussions/5261

## What is a Python model in dbt?

A dbt Python model is a function applying a series of transformations, and returning a transformed dataset. Specifically, each Python model returns a single data frame. When you run a Python model, the result of that data frame will be saved as a table in your data warehouse.

Each Python model lives in a `.py` file in your `models/` folder. It defines a function named `model()`, which accepts two arguments:
- **`dbt`**: A class compiled by dbt Core, unique to each model, that enables you to run your Python code in the context of your dbt project and DAG.
- **`session`**: Represents the current Python application session. On some data platforms, the session variable is available globally, so the argument is not required. For cross-compatibility, the code examples below will show this as `session=None`.
- returns: a data frame (Snowpark, PySpark, or Pandas)

dbt Python models have access to all of the same configuration options as SQL models. You can test them, document them, add `tags` and `meta` properties to them, persist their descriptions as database comments, grant access on their results to other users, and so on. You can select them by their name, their file path, their configurations, whether they are upstream or downstream of another model.

### Referencing other models

Your Python model will want to read data from other SQL models, using the `dbt.ref()` function. The same idea applies for `dbt.source()`. Those functions return data frames, pointing to the upstream source, model, seed, or snapshot. 

<File name='models/my_python_model.py'>

```python
def model(dbt, session=None):
  
    # data frame representing an upstream model
    upstream_model = dbt.ref("upstream_model_name")
    
    # data frame representing an upstream source
    upstream_source = dbt.source("upstream_source_name", "table_name")
```

</File>

Of course, you can `ref()` your Python model in downstream SQL models, too:

<File name='models/downstream_model.sql'>

```sql
with upstream_python_model as (
  
    select * from {{ ref('my_python_model') }}
  
),

...
```

</File>

### Configuring Python models

Just like with SQL models, there are three ways to configure Python models:
1. In `dbt_project.yml`, where you can configure many models at once
2. In a dedicated `.yml` file, within the `models/` directory
3. Within the model's `.py` file, using the `dbt.config()` function

The `dbt.config()` function allows you to set configurations for your model:

<File name='models/my_python_model.py'>

```python
def model(dbt, session=None):
    
    # setting configuration
    dbt.config(materialized="table")
```

</File>

The `config()` function accepts _only_ literal values (strings, booleans, and numeric types). It is not possible to pass another function or more complex data structure. The reason: dbt statically analyzes the arguments to `config()` while parsing your model, without actually executing any of your Python code.

Python models have limited access to project context, including inputs such as `var`, `env_var`, and `target`. If you want to use those values to power conditional logic in your model, we recommend passing them through a dedicated `.yml` file config instead:

<File name='models/config.yml'>

```yml
version: 2

models:
  - name: my_python_model
    config:
      materialized: table
      target_name: "{{ target.name }}"
      specific_env_var: "{{ env_var('SPECIFIC_ENV_VAR') }}"
```

</File>

Then, use the `dbt.config.get()` function to _access_ values of configurations that have been set:

<File name='models/my_python_model.py'>

```python
def model(dbt, session=None):
    ...
    target_name = dbt.config.get("target_name")
    
    # limit data in dev
    if target_name == "dev":
        df.limit(500)
```

</File>

### Materializations

Python models support two materializations:
- `table`
- `incremental`

For incremental models, similar to SQL models, you will need to filter incoming tables to just new rows of data:

<File name='models/my_python_model.py'>

```python
from snowflake.snowpark.functions import lit, dateadd, current_timestamp

def model(dbt, session=None):
    dbt.config(materialized = "incremental")
    df = dbt.ref("upstream_table")
    
    if dbt.is_incremental:

        # only new rows compared to max in current table
        max_from_this = f"select max(id) from {dbt.this}"
        df = df.filter(df.updated_at >= session.sql(max_from_this).collect()[0][0])

        # or only rows from the past 3 days
        # TODO actually check this syntax
        df = df.filter(df.updated_at >= dateadd("day", lit(-3), current_timestamp()))
```

</File>

## Python-specific functionality

### Defining functions

In addition to defining a `model` function, the Python model can import other functions, or define its own functions. Here's an example, on Snowpark, defining a custom `add_one` function:

<File name='models/my_python_model.py'>

```python
import snowflake.snowpark as snowpark
from snowflake.snowpark.functions import col

def add_one(x):
    return x + 1

def model(dbt, session=None):
    dbt.config(materialized="table")
    temps_df = dbt.ref("temperatures")
    
    # warm things up just a little
    df = temps_df.withColumn("degree_plus_one", add_one(col("degree")))
    return df
```

</File>

### Using PyPI packages

These functions can also come from installed packages:

```python
import numpy

...

# TODO: example to come
```

#### Configuring packages

We encourage you to explicitly configure required packages and versions, so that dbt can track them in project metadata. If you need specific versions of packages, specify them.

<File name='models/my_python_model.py'>

```python
def model(dbt, session=None):
    dbt.config(
      packages = ["numpy==1.23.1", "scikit-learn"]
    )
```

</File>

<File name='models/config.yml'>

```yml
version: 2

models:
  - name: my_python_model
    config:
      packages:
        - "numpy==1.23.1"
        - scikit-learn
```

</File>

### DataFrame syntaxes

A "data frame" is a two dimensional data structure, and a common object when interacting with datasets in Python. dbt returns `ref()` and `source()` as data frames, and it expects all Python models to return a data frame.

The Pandas library offers the most common syntax for interacting with data frames. Both Snowpark and PySpark also offer:
1. Their own data frame APIs
2. Interoperability with Pandas, via conversion methods or [Koalas](https://koalas.readthedocs.io/en/latest/)

**Why Pandas?** Standard. Easy to develop locally, easy to migrate your code.

**Why not Pandas?** Performance. TODO more here.

TODO talk about Ibis? https://ibis-project.org/docs

### Limitations

- **Time and cost.** Python models are slower to run than SQL models, and the cloud resources that run them can be more expensive. Running Python requires more general-purpose compute, and in some cases that compute may live on a separate service or architecture from your SQL models. However, we believe that deploying Python models via dbt is **dramatically** faster and cheaper than spinning up separate tooling and infrastructure to orchestrate Python transformations in production.
- **Syntax differences** are even more pronounced. Over the years, dbt has done a lot, via dispatch patterns and packages such as `dbt_utils`, to abstract over differences in SQL dialects across popular data warehouses. Python offers a **much** wider field of play. If there are 5 ways to do something in SQL, there are 50 ways to write it in Python, all with varying performance and adherence to standards. Those options can be overwhelming. As the maintainers of dbt, we will be learning from state-of-the-art projects that are tackling this problem, and sharing opinionated guidance as we develop it.
- **These capabilities are very new.** As data warehouses release new features, we reserve the right to change the underlying implementation for executing Python models. Our commitment to you is around the code in your Python models, following the guidance above, rather than specific implementation details.

## Specific data warehouses

Currently, Python models are supported for users of `dbt-snowflake`, `dbt-spark` (Databricks), and `dbt-bigquery`.

<WHCode>

<div warehouse="Snowflake">

**Additional setup:** None needed. Snowpark Python is in Public Preview - Open, and enabled by default for all accounts.

**Docs:** https://docs.snowflake.com/en/developer-guide/snowpark/python/index.html

**Installing packages:** Snowpark supports a number of popular packages via Anaconda. The full list: https://repo.anaconda.com/pkgs/snowflake/

Packages are installed at the time your model is being run. Different models can have different package dependencies.

https://docs.snowflake.com/en/developer-guide/udf/python/udf-python-packages.html

</div>

<div warehouse="Databricks">

**Additional setup:**
- The `user` field in the `dbt-spark` profile, usually optional, is required for Python modeling.

**Notes:**
- Python models will be created and run as notebooks in your Databricks workspace. The notebooks will be created within the personal workspace of the `user` running dbt.

**Installing packages:** We recommend configuring packages on the interactive cluster which you will be using to run your Python models.

**Docs:**
- https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.html
- https://docs.databricks.com/spark/latest/dataframes-datasets/introduction-to-dataframes-python.html

</div>

<div warehouse="BigQuery">

The `dbt-bigquery` uses a service called Dataproc to submit your Python models as PySpark jobs. That Python/PySpark code will read from your tables and views in BigQuery, and saves its final result back to BigQuery.

**Additional setup:**
- Create a dedicated Dataproc cluster: https://cloud.google.com/dataproc/docs/guides/create-cluster
- Create a dedicated Cloud Storage bucket: https://cloud.google.com/storage/docs/creating-buckets

Add these attributes to your BigQuery profile:
- `gcs_bucket`
- `dataproc_region`
- `dataproc_cluster_name`

**Installing packages:** Google recommends installing Python packages on Dataproc clusters via initialization actions:
- ["How initialization actions are used"](https://github.com/GoogleCloudDataproc/initialization-actions/blob/master/README.md#how-initialization-actions-are-used)
- [Actions for installing via `pip` or `conda`](https://github.com/GoogleCloudDataproc/initialization-actions/tree/master/python)

**Docs:**
- [Dataproc overview](https://cloud.google.com/dataproc/docs/concepts/overview)
- [PySpark dataframe syntax](https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.html)

</div>

</WHCode>
